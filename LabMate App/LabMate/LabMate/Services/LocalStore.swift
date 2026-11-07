import Foundation

/// Port of src/lib/storage.ts persistence. JSON files in Application Support;
/// the onboarded flag lives in UserDefaults so clearAll() never wipes it.
///
/// `LocalStore()` is the signed-out, local-only store. `LocalStore.cloudCache(uid:)` is a
/// per-account snapshot of the last Firestore data, used to paint instantly on launch
/// before auth restores and listeners deliver deltas.
nonisolated struct LocalStore: Sendable {
    private static let onboardedKey = "labmate:onboarded:v1"
    private static let lastUidKey = "labmate:lastUid:v1"

    private let subpath: String

    init() { subpath = "LabMate" }
    private init(subpath: String) { self.subpath = subpath }

    static func cloudCache(uid: String) -> LocalStore { LocalStore(subpath: "LabMate/cloud-cache/\(uid)") }

    /// Uid of the account whose cloud cache should be shown at launch (nil = signed out).
    static var lastUid: String? {
        get { UserDefaults.standard.string(forKey: lastUidKey) }
        set { UserDefaults.standard.set(newValue, forKey: lastUidKey) }
    }

    private var dir: URL {
        let base = FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask)[0]
        let d = base.appendingPathComponent(subpath, isDirectory: true)
        try? FileManager.default.createDirectory(at: d, withIntermediateDirectories: true)
        return d
    }
    private var resultsURL: URL { dir.appendingPathComponent("results.json") }
    private var profileURL: URL { dir.appendingPathComponent("profile.json") }
    private var customURL: URL { dir.appendingPathComponent("customMarkers.json") }

    private func read<T: Decodable>(_ type: T.Type, _ url: URL) -> T? {
        guard let data = try? Data(contentsOf: url) else { return nil }
        return try? JSONDecoder().decode(T.self, from: data)
    }
    private func write<T: Encodable>(_ value: T, _ url: URL) {
        let enc = JSONEncoder()
        enc.outputFormatting = [.sortedKeys]
        if let data = try? enc.encode(value) { try? data.write(to: url, options: .atomic) }
    }

    func loadResults() -> [MarkerResult] { read([MarkerResult].self, resultsURL) ?? [] }
    func saveResults(_ r: [MarkerResult]) { write(r, resultsURL) }
    func loadCustomMarkers() -> [CustomMarker] { read([CustomMarker].self, customURL) ?? [] }
    func saveCustomMarkers(_ m: [CustomMarker]) { write(m, customURL) }
    func loadProfile() -> Profile { read(Profile.self, profileURL) ?? .empty }
    func saveProfile(_ p: Profile) { write(p, profileURL) }

    /// True when there is anything worth migrating into a cloud account.
    var hasData: Bool { !loadResults().isEmpty || !loadCustomMarkers().isEmpty || loadProfile() != .empty }

    /// Removes results, profile and custom markers. Leaves the onboarded flag alone.
    func clearAll() {
        for u in [resultsURL, profileURL, customURL] { try? FileManager.default.removeItem(at: u) }
    }

    /// Deletes every per-account cloud cache (log out / account switch on a shared device).
    static func clearAllCloudCaches() {
        let base = FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask)[0]
        try? FileManager.default.removeItem(at: base.appendingPathComponent("LabMate/cloud-cache", isDirectory: true))
    }

    var hasOnboarded: Bool { UserDefaults.standard.bool(forKey: Self.onboardedKey) }
    func setOnboarded() { UserDefaults.standard.set(true, forKey: Self.onboardedKey) }

    /// Pretty JSON of everything in this store: { results, profile, customMarkers }.
    func exportAllData() -> String {
        struct Export: Encodable { let results: [MarkerResult]; let profile: Profile; let customMarkers: [CustomMarker] }
        let enc = JSONEncoder()
        enc.outputFormatting = [.prettyPrinted, .sortedKeys]
        let e = Export(results: loadResults(), profile: loadProfile(), customMarkers: loadCustomMarkers())
        return (try? enc.encode(e)).flatMap { String(data: $0, encoding: .utf8) } ?? "{}"
    }
}
