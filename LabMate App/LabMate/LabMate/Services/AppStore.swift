import Foundation
import Observation
import FirebaseAuth

/// Single source of truth. Mirrors the state logic in src/App.tsx:
/// signed out -> local JSON store; signed in -> Firestore listeners drive state.
/// Launch is cache-first: the last account snapshot (LocalStore.cloudCache) paints immediately,
/// Firestore's persistent cache serves the first listener event from disk, and only server
/// deltas arrive afterwards. Local-only data is migrated into the account only when some exists.
@Observable
@MainActor
final class AppStore {
    // MARK: State
    private(set) var results: [MarkerResult]
    private(set) var profile: Profile
    private(set) var customMarkers: [CustomMarker]
    private(set) var cloudReady = false
    private(set) var migrating = false
    private(set) var healthSyncing = false
    /// Last user-facing error (cloud write failure, sign-in failure...). UI may show then call `clearError()`.
    var authError: String?
    /// True after Quick Start / Skip / sign-in has happened once on this device.
    private(set) var dismissedSplash: Bool
    /// Transient: set by logOut() so the splash shows again even for a returning local user.
    var forceSplash = false
    /// Mirrors the web "Apple Health" toggle: when true, launch/foreground syncs and write-back run.
    var healthEnabled: Bool {
        didSet { UserDefaults.standard.set(healthEnabled, forKey: "labmate:healthEnabled:v1") }
    }

    let auth = AuthService()
    @ObservationIgnored private let local = LocalStore()
    @ObservationIgnored private let cloud = CloudStore()
    @ObservationIgnored let health = HealthKitService()
    @ObservationIgnored private var unsubscribers: [() -> Void] = []
    @ObservationIgnored private var migrationTask: Task<Void, Never>?
    @ObservationIgnored private var started = false
    /// Per-account snapshot of cloud data for instant launch; nil when signed out.
    @ObservationIgnored private var cache: LocalStore?
    @ObservationIgnored private var cacheSaveTask: Task<Void, Never>?
    /// Uid restored from the cache at launch, before Firebase Auth reports.
    @ObservationIgnored private var cachedUid: String?

    init() {
        if let uid = LocalStore.lastUid {
            let c = LocalStore.cloudCache(uid: uid)
            cache = c
            cachedUid = uid
            results = c.loadResults()
            profile = c.loadProfile()
            customMarkers = c.loadCustomMarkers()
        } else {
            results = local.loadResults()
            profile = local.loadProfile()
            customMarkers = local.loadCustomMarkers()
        }
        dismissedSplash = local.hasOnboarded || LocalStore.lastUid != nil
        healthEnabled = UserDefaults.standard.bool(forKey: "labmate:healthEnabled:v1")
    }

    // MARK: Derived

    /// results + derived markers (e.g. Lymphocytes % from WCC). Recomputed on every change, never persisted.
    var allResults: [MarkerResult] { results + DerivedMarkers.deriveComputedMarkers(results) }
    var user: AuthUser? { auth.user }
    var isSignedIn: Bool { auth.user != nil }
    var isCloudAvailable: Bool { auth.isCloudAvailable }
    var initializing: Bool { auth.initializing }
    /// Web: `!user && (forceSplash || (!dismissedSplash && results.isEmpty))`
    var shouldShowSplash: Bool {
        // While auth is still restoring a cached account, keep showing its data, not the splash.
        if initializing && cachedUid != nil && !forceSplash { return false }
        return !isSignedIn && (forceSplash || (!dismissedSplash && results.isEmpty))
    }
    var themePreference: ThemePreference { profile.theme ?? .auto }

    // MARK: Lifecycle

    /// Call once at launch (e.g. `.task { store.start() }`).
    func start() {
        guard !started else { return }
        started = true
        auth.onUserChange = { [weak self] user in self?.handleUserChange(user) }
        auth.start()
    }

    func clearError() { authError = nil }

    private func handleUserChange(_ user: AuthUser?) {
        migrationTask?.cancel()
        teardownSubscriptions()
        cloudReady = false
        guard user != nil, let fb = auth.firebaseUser else {
            // Signed out (here or elsewhere): drop the account cache so a shared device
            // doesn't keep showing the previous person's results.
            migrating = false
            clearAccountCache()
            reloadFromLocal()
            return
        }
        if cachedUid != fb.uid {
            // Different (or first) account on this device: start from an empty cache.
            if cachedUid != nil { LocalStore.clearAllCloudCaches() }
            if !local.hasData { results = []; profile = .empty; customMarkers = [] }
        }
        cachedUid = fb.uid
        LocalStore.lastUid = fb.uid
        cache = LocalStore.cloudCache(uid: fb.uid)
        dismissedSplash = true

        guard local.hasData else {
            // Nothing local to merge: attach listeners straight away (served from disk cache first).
            cloudReady = true
            subscribe(uid: fb.uid)
            if healthEnabled { Task { await syncHealth() } }
            return
        }
        migrating = true
        let localResults = local.loadResults(), localCustom = local.loadCustomMarkers(), localProfile = local.loadProfile()
        migrationTask = Task { [weak self] in
            guard let self else { return }
            do {
                try await cloud.migrateLocalDataToCloud(user: fb, results: localResults, customMarkers: localCustom, profile: localProfile)
                if Task.isCancelled { return }
                local.clearAll()
                migrating = false
                cloudReady = true
                subscribe(uid: fb.uid)
                if healthEnabled { await syncHealth() }
            } catch {
                if Task.isCancelled { return }
                NSLog("Cloud sync failed: \(error)")
                migrating = false
                authError = "Could not sync to the cloud. Please try again."
            }
        }
    }

    private func subscribe(uid: String) {
        unsubscribers = [
            cloud.subscribeResults(uid: uid) { [weak self] in self?.results = $0; self?.scheduleCacheSave() },
            cloud.subscribeProfile(uid: uid) { [weak self] in self?.profile = $0; self?.scheduleCacheSave() },
            cloud.subscribeCustomMarkers(uid: uid) { [weak self] in self?.customMarkers = $0; self?.scheduleCacheSave() },
        ]
    }

    /// Debounced write of the current account snapshot, off the main thread.
    private func scheduleCacheSave() {
        guard let cache else { return }
        cacheSaveTask?.cancel()
        let r = results, p = profile, c = customMarkers
        cacheSaveTask = Task.detached(priority: .utility) {
            try? await Task.sleep(for: .milliseconds(500))
            if Task.isCancelled { return }
            cache.saveResults(r)
            cache.saveProfile(p)
            cache.saveCustomMarkers(c)
        }
    }

    private func clearAccountCache() {
        cacheSaveTask?.cancel()
        cache = nil
        cachedUid = nil
        LocalStore.lastUid = nil
        LocalStore.clearAllCloudCaches()
    }

    private func teardownSubscriptions() {
        unsubscribers.forEach { $0() }
        unsubscribers = []
    }

    private func reloadFromLocal() {
        results = local.loadResults()
        profile = local.loadProfile()
        customMarkers = local.loadCustomMarkers()
    }

    /// Signed in but listeners not yet attached: writes would race the migration.
    private var cloudMode: Bool { isSignedIn }

    private func reportCloudError(_ error: Error) {
        NSLog("Cloud write failed: \(error)")
        authError = "Could not save your change. Please try again."
    }

    private func cloudWrite(_ op: @escaping (String) async throws -> Void) {
        guard let uid = auth.user?.uid else { return }
        Task { [weak self] in
            do { try await op(uid) } catch { self?.reportCloudError(error) }
        }
    }

    // MARK: Results

    /// Imported (parsed PDF / pasted text) results. Merges with dedupe, then writes Health-compatible rows back.
    func importResults(_ incoming: [MarkerResult]) {
        let merged = ResultMerge.mergeResults(results, incoming)
        let existingIDs = Set(results.map(\.id))
        let added = merged.filter { !existingIDs.contains($0.id) }
        if cloudMode {
            cloudWrite { [cloud] uid in try await cloud.saveResults(uid: uid, added) }
        } else {
            results = merged
            local.saveResults(merged)
        }
        writeToHealth(added)
    }

    /// Adds a manual result. Returns false if it was an exact duplicate (same marker+date+displayValue).
    @discardableResult
    func addManualResult(_ input: MarkerResult) -> Bool {
        var r = input
        r.id = MarkerResult.newID()
        r.createdAt = MarkerResult.nowTimestamp()
        r.addedManually = true
        let merged = ResultMerge.mergeResults(results, [r])
        guard merged.count == results.count + 1 else { return false }
        if cloudMode {
            cloudWrite { [cloud] uid in try await cloud.saveResult(uid: uid, r) }
        } else {
            results = merged
            local.saveResults(merged)
        }
        writeToHealth([r])
        return true
    }

    func deleteResult(id: String) {
        if cloudMode {
            cloudWrite { [cloud] uid in try await cloud.deleteResult(uid: uid, id: id) }
        } else {
            results = ResultMerge.removeResult(results, id: id)
            local.saveResults(results)
        }
    }

    func updateResult(id: String, patch: ResultPatch) {
        if cloudMode {
            cloudWrite { [cloud] uid in try await cloud.updateResult(uid: uid, id: id, patch: patch) }
        } else {
            results = ResultMerge.updateResult(results, id: id, patch: patch)
            local.saveResults(results)
        }
    }

    // MARK: Custom markers

    static func slugify(_ name: String) -> String {
        let lower = name.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
        var out = ""
        var lastUnderscore = false
        for ch in lower.unicodeScalars {
            if (ch.value >= 97 && ch.value <= 122) || (ch.value >= 48 && ch.value <= 57) {
                out.unicodeScalars.append(ch); lastUnderscore = false
            } else if !lastUnderscore { out.append("_"); lastUnderscore = true }
        }
        return out.trimmingCharacters(in: CharacterSet(charactersIn: "_"))
    }

    func addCustomMarker(label: String, unit: String) {
        let key = "custom_\(Self.slugify(label))"
        registerCustomMarker(CustomMarker(key: key, label: label, unit: unit, createdAt: MarkerResult.nowTimestamp()))
    }

    private func registerCustomMarker(_ marker: CustomMarker) {
        guard !customMarkers.contains(where: { $0.key == marker.key }) else { return }
        if cloudMode {
            cloudWrite { [cloud] uid in try await cloud.saveCustomMarker(uid: uid, marker) }
        } else {
            customMarkers.append(marker)
            local.saveCustomMarkers(customMarkers)
        }
    }

    // MARK: Profile / onboarding

    func saveProfile(_ next: Profile) {
        if cloudMode {
            cloudWrite { [cloud] uid in try await cloud.saveProfile(uid: uid, next) }
        } else {
            profile = next
            local.saveProfile(next)
        }
    }

    func quickStart(name: String) {
        var p = profile
        p.name = name
        saveProfile(p)
        local.setOnboarded()
        dismissedSplash = true
        forceSplash = false
    }

    func skipSplash() {
        local.setOnboarded()
        dismissedSplash = true
        forceSplash = false
    }

    // MARK: Data / account

    func deleteAllData() {
        if cloudMode {
            cloudWrite { [cloud] uid in try await cloud.deleteAllCloudData(uid: uid) }
        } else {
            local.clearAll()
            results = []
            profile = .empty
            customMarkers = []
        }
    }

    func exportLocalData() -> String { local.exportAllData() }

    func signIn() async {
        authError = nil
        do { try await auth.signInWithGoogle() }
        catch {
            // User cancelling the Google sheet is not an error worth surfacing.
            if (error as NSError).code == -5 { return }
            NSLog("Sign-in failed: \(error)")
            authError = "Sign-in failed. Please try again."
        }
    }

    /// Signs out if signed in, then forces the splash (matches web handleLogOut).
    func logOut() {
        authError = nil
        if isSignedIn {
            do { try auth.signOut() } catch {
                NSLog("Sign-out failed: \(error)")
                authError = "Sign-out failed. Please try again."
                return
            }
        }
        forceSplash = true
    }

    func deleteAccount() async {
        guard let fb = auth.firebaseUser else { return }
        authError = nil
        do {
            try await cloud.deleteAccount(user: fb) { [auth] in try await auth.reauthenticate() }
        } catch {
            NSLog("Account deletion failed: \(error)")
            authError = "Could not delete your account. Please try again."
        }
    }

    // MARK: HealthKit

    /// Enables Health integration (prompts for authorisation), prefills empty profile fields, and syncs.
    func enableHealth() async {
        guard health.isAvailable else { authError = "Apple Health is not available on this device."; return }
        do { try await health.ensureAuthorisation() } catch {
            authError = "Could not get Apple Health access."; return
        }
        healthEnabled = true
        await prefillProfileFromHealth()
        await syncHealth()
        writeToHealth(results)
    }

    func disableHealth() { healthEnabled = false }

    /// Pulls Health metrics into the results store (idempotent: ids are type+date).
    /// Custom markers earlier builds auto-created for Health metrics LabMate no longer reads.
    private static let retiredHealthCustomKeys: Set<String> = [
        "custom_resting_heart_rate", "custom_hrv_sdnn", "custom_body_mass",
        "custom_height", "custom_bmi", "custom_waist_circumference",
    ]

    func syncHealth() async {
        guard healthEnabled, health.isAvailable, !healthSyncing else { return }
        if auth.user != nil && !cloudReady { return }
        healthSyncing = true
        defer { healthSyncing = false }
        do {
            let latest = try await health.fetchLatestResults()
            let latestByID = Dictionary(uniqueKeysWithValues: latest.map { ($0.id, $0) })
            // Every other Health-sourced row is stale history (or a metric LabMate no longer
            // reads, e.g. resting heart rate) - Apple Health still has it, so drop our copy.
            let staleIDs = results.filter { $0.sourceFile == HealthKitService.sourceName && latestByID[$0.id] == nil }.map(\.id)
            let changed = latest.filter { r in
                guard let old = results.first(where: { $0.id == r.id }) else { return true }
                return old.date != r.date || old.value != r.value
            }
            let keptKeys = Set(HealthKitService.mappings.map(\.markerKey))
            let staleCustomKeys = customMarkers.filter { Self.retiredHealthCustomKeys.contains($0.key) && !keptKeys.contains($0.key) }.map(\.key)
            guard !changed.isEmpty || !staleIDs.isEmpty || !staleCustomKeys.isEmpty else { return }
            if cloudMode {
                cloudWrite { [cloud] uid in
                    try await cloud.replaceResults(uid: uid, upserts: changed, deleteIDs: staleIDs, deleteCustomKeys: staleCustomKeys)
                }
            } else {
                let stale = Set(staleIDs)
                results.removeAll { stale.contains($0.id) || latestByID[$0.id] != nil }
                results.append(contentsOf: latest)
                local.saveResults(results)
                customMarkers.removeAll { staleCustomKeys.contains($0.key) }
                local.saveCustomMarkers(customMarkers)
            }
        } catch {
            NSLog("Health sync failed: \(error)")
            authError = "Could not read Apple Health."
        }
    }

    /// Fills DOB/sex from Health only where the profile is empty.
    func prefillProfileFromHealth() async {
        let d = await health.profileDefaults()
        var p = profile
        var changed = false
        if p.birthDate == nil, let b = d.birthDate { p.birthDate = b; changed = true }
        if p.sex == nil, let s = d.sex { p.sex = s; changed = true }
        if changed { saveProfile(p) }
    }

    private func writeToHealth(_ rows: [MarkerResult]) {
        guard healthEnabled, health.isAvailable, !rows.isEmpty else { return }
        Task { [health] in
            do { try await health.write(rows) } catch { NSLog("Health write failed: \(error)") }
        }
    }
}
