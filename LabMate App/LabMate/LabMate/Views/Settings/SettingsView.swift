import SwiftUI

/// Settings tab. Port of Settings.tsx plus the App.tsx wiring, styled like a Health profile page.
struct SettingsView: View {
    @Environment(AppStore.self) private var store

    @State private var nameInput = ""
    @State private var confirmWipe = false
    @State private var confirmDeleteAccount = false
    @FocusState private var nameFocused: Bool

    private var profile: Profile { store.profile }
    private var locked: Bool { store.migrating }

    var body: some View {
        NavigationStack {
            List {
                header
                if store.migrating { migratingSection }
                accountSection
                aboutYouSection
                appearanceSection
                healthSection
                dataSection
                aboutSection
            }
            .listStyle(.insetGrouped)
            .scrollContentBackground(.hidden)
            .background(HealthColor.canvas.ignoresSafeArea())
            .navigationTitle("Settings")
            .navigationBarTitleDisplayMode(.large)
            .toolbar { ImportToolbarButton() }
            .onAppear { nameInput = profile.name ?? "" }
            .onChange(of: profile.name) { _, new in if !nameFocused { nameInput = new ?? "" } }
            .confirmationDialog("Delete all LabMate data?", isPresented: $confirmWipe, titleVisibility: .visible) {
                Button("Delete All Data", role: .destructive) { store.deleteAllData() }
                Button("Cancel", role: .cancel) {}
            } message: {
                Text(store.isSignedIn
                     ? "This removes every result, your profile and custom metrics from your account. This cannot be undone."
                     : "This removes every imported or manual result, your profile and custom metrics from this device. This cannot be undone.")
            }
            .confirmationDialog("Delete your account?", isPresented: $confirmDeleteAccount, titleVisibility: .visible) {
                Button("Delete Account", role: .destructive) { Task { await store.deleteAccount() } }
                Button("Cancel", role: .cancel) {}
            } message: {
                Text("Permanently delete your LabMate account and all its data. This cannot be undone - export a backup first if you might want this data again.")
            }
        }
    }

    // MARK: Sections

    private var header: some View {
        Section {
            HStack(spacing: 14) {
                Image("AppLogo")
                    .resizable().scaledToFit()
                    .frame(width: 56, height: 56)
                    .clipShape(.rect(cornerRadius: 13, style: .continuous))
                    .accessibilityHidden(true)
                VStack(alignment: .leading, spacing: 2) {
                    Text(profile.name?.isEmpty == false ? profile.name! : "LabMate").font(.title2.weight(.bold))
                    Text(store.user?.email ?? "Stored on this device")
                        .font(.subheadline).foregroundStyle(.secondary)
                }
            }
            .accessibilityElement(children: .combine)
        }
    }

    private var migratingSection: some View {
        Section {
            HStack(spacing: 12) {
                ProgressView()
                Text("Syncing your data to the cloud...")
            }
            .accessibilityElement(children: .combine)
        }
    }

    private var accountSection: some View {
        Section {
            if let err = store.authError {
                Text(err).foregroundStyle(HealthColor.critical)
                    .accessibilityLabel("Error: \(err)")
            }
            if !store.isCloudAvailable {
                Label("Cloud sync unavailable", systemImage: "icloud.slash")
                    .foregroundStyle(.secondary)
            } else if let user = store.user {
                VStack(alignment: .leading, spacing: 2) {
                    if let n = user.displayName { Text(n).font(.headline) }
                    Text(user.email ?? "Signed in").font(.subheadline).foregroundStyle(.secondary)
                }
                .accessibilityElement(children: .combine)
                .accessibilityLabel("Signed in as \(user.email ?? user.displayName ?? "your account")")
                Button("Log Out", role: .destructive) { store.logOut() }
                    .disabled(locked)
            } else {
                Button { Task { await store.signIn() } } label: {
                    HealthLinkLabel(title: locked ? "Signing in..." : "Sign in with Google", symbol: "person.crop.circle.badge.checkmark")
                }
                .disabled(locked)
                if Features.signInWithApple {
                    Button { Task { await store.signInWithApple() } } label: {
                        HealthLinkLabel(title: locked ? "Signing in..." : "Sign in with Apple", symbol: "applelogo")
                    }
                    .disabled(locked)
                }
            }
        } header: {
            Text("Account")
        } footer: {
            if store.isCloudAvailable {
                Text(store.isSignedIn
                     ? "Your data syncs to this account and is available on any device you sign into."
                     : "Sign in to sync your data across devices. Without signing in, everything stays on this device only - it's gone if you delete the app.")
            }
        }
    }

    private var aboutYouSection: some View {
        Section {
            TextField("What should we call you?", text: $nameInput)
                .textContentType(.givenName)
                .focused($nameFocused)
                .submitLabel(.done)
                .disabled(locked)
                .onSubmit(commitName)
                .onChange(of: nameFocused) { _, focused in if !focused { commitName() } }
                .accessibilityLabel("Name")

            DatePicker("Date of birth", selection: birthDateBinding, in: ...Date.now, displayedComponents: .date)
                .disabled(locked)
            if profile.birthDate != nil {
                Button("Clear date of birth", role: .destructive) { update { $0.birthDate = nil } }
                    .disabled(locked)
            }

            Picker("Sex", selection: sexBinding) {
                Text("Not set").tag(Sex?.none)
                Text("Male").tag(Sex?.some(.M))
                Text("Female").tag(Sex?.some(.F))
            }
            .disabled(locked)

            Toggle("I take a creatine supplement", isOn: Binding(
                get: { profile.takesCreatineSupplement ?? false },
                set: { v in update { $0.takesCreatineSupplement = v } }))
                .disabled(locked)
        } header: {
            Text("About You")
        } footer: {
            Text("Name is used for the greeting. Date of birth gives your age for the biological age comparison. Sex is only used for kidney-function equations (eGFR / Cystatin C), which differ by sex. Creatine raises serum creatinine independent of kidney function: when set, the biological age breakdown stops treating creatinine as something to act on, and (if you have a Cystatin C result) shows a creatine-adjusted estimate alongside the real one.")
        }
    }

    private var appearanceSection: some View {
        Section("Appearance") {
            Picker("Theme", selection: Binding(
                get: { profile.theme ?? .auto },
                set: { v in update { $0.theme = v } })) {
                Label("System", systemImage: "iphone").tag(ThemePreference.auto)
                Label("Light", systemImage: "sun.max.fill").tag(ThemePreference.light)
                Label("Dark", systemImage: "moon.fill").tag(ThemePreference.dark)
            }
            .pickerStyle(.menu)
        }
    }

    private var healthSection: some View {
        Section {
            Toggle(isOn: Binding(
                get: { store.healthEnabled },
                set: { on in Task { if on { await store.enableHealth() } else { store.disableHealth() } } })) {
                Label("Apple Health", systemImage: "heart.fill")
                    .foregroundStyle(HealthColor.heart)
            }
            .accessibilityHint("Reads body measurements from Apple Health and writes your lab results back")

            if store.healthEnabled {
                Button { Task { await store.syncHealth() } } label: {
                    HStack {
                        HealthLinkLabel(title: store.healthSyncing ? "Syncing..." : "Sync now", symbol: "arrow.triangle.2.circlepath.circle.fill")
                        Spacer()
                        if store.healthSyncing { ProgressView() }
                    }
                }
                .disabled(store.healthSyncing)
                .accessibilityLabel(store.healthSyncing ? "Syncing with Apple Health" : "Sync now with Apple Health")

                Button { Task { await store.prefillProfileFromHealth() } } label: {
                    HealthLinkLabel(title: "Fill profile from Health", symbol: "person.crop.circle.fill.badge.checkmark")
                }
                .disabled(locked)
            }
        } header: {
            Text("Apple Health")
        } footer: {
            Text("Reads: VO2 max, body fat % and lean mass, plus date of birth and sex (only to fill empty profile fields). Writes: lab results that have an Apple Health equivalent, such as blood glucose, body fat % and lean mass. Nothing is shared with anyone else, and you can turn this off at any time.")
        }
    }

    private var dataSection: some View {
        Section {
            ShareLink(item: store.exportLocalData(), subject: Text("LabMate data export"), message: Text("LabMate data export")) {
                Label("Export Data", systemImage: "square.and.arrow.up")
            }
            .accessibilityHint("Share a JSON backup of your data")

            Button("Delete All Data", systemImage: "trash", role: .destructive) { confirmWipe = true }
                .disabled(locked)
            if store.isSignedIn {
                Button("Delete Account", systemImage: "person.crop.circle.badge.xmark", role: .destructive) { confirmDeleteAccount = true }
                    .disabled(locked)
            }
        } header: {
            Text("Your Data")
        } footer: {
            Text(store.isSignedIn
                 ? "Delete All Data permanently removes every result, your profile and custom metrics from your account (your sign-in stays active). Delete Account removes the account itself and all synced data. There is no undo - export a backup first."
                 : "Delete All Data permanently removes every result, your profile and custom metrics from this device. There is no undo and no server copy to restore from - export a backup first.")
        }
    }

    private var aboutSection: some View {
        Section("About") {
            Text("LabMate tracks your blood test results over time. Biological age, scores and the test plan are illustrative scheduling and wellness heuristics, not diagnostic or medical advice. General information only - talk to your doctor before changing anything based on these results.")
                .font(.footnote)
                .foregroundStyle(.secondary)
            Text("Biological age uses the PhenoAge formula (Levine et al. 2018) and kidney function uses published eGFR equations; see the info cards in Insights for sources and limitations. LabMate is not a medical device and has no regulatory clearance. Always check with a doctor before making medical decisions.")
                .font(.footnote)
                .foregroundStyle(.secondary)
            if let url = AppLinks.privacyPolicy {
                Link(destination: url) { Label("Privacy Policy", systemImage: "hand.raised") }
            }
            if let url = AppLinks.support {
                Link(destination: url) { Label("Support", systemImage: "questionmark.circle") }
            }
        }
    }

    // MARK: Helpers

    private func update(_ change: (inout Profile) -> Void) {
        var p = profile
        change(&p)
        if p != profile { store.saveProfile(p) }
    }

    private func commitName() {
        let trimmed = nameInput.trimmingCharacters(in: .whitespacesAndNewlines)
        update { $0.name = trimmed.isEmpty ? nil : trimmed }
    }

    private var birthDateBinding: Binding<Date> {
        Binding(
            get: { profile.birthDate.flatMap(DateUtils.date(fromIso:)) ?? Calendar.current.date(byAdding: .year, value: -30, to: .now) ?? .now },
            set: { d in update { $0.birthDate = DateUtils.iso(from: d) } })
    }

    private var sexBinding: Binding<Sex?> {
        Binding(get: { profile.sex }, set: { v in update { $0.sex = v } })
    }
}

#Preview {
    SettingsView()
        .environment(AppStore())
        .environment(AppRouter())
}
