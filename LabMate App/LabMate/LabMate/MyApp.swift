import GoogleSignIn
import SwiftUI

@main struct LabMateApp: App {
    @State private var store = AppStore()
    @Environment(\.scenePhase) private var scenePhase

    var body: some Scene {
        WindowGroup {
            RootView()
                .environment(store)
                .preferredColorScheme(store.themePreference.colorScheme)
                .task { store.start() }
                // Completes the Google Sign-In round trip (REVERSED_CLIENT_ID URL scheme).
                .onOpenURL { url in _ = GIDSignIn.sharedInstance.handle(url) }
                .onChange(of: scenePhase) { _, phase in
                    if phase == .active, store.healthEnabled {
                        Task { await store.syncHealth() }
                    }
                }
        }
    }
}

extension ThemePreference {
    var colorScheme: ColorScheme? {
        switch self {
        case .light: .light
        case .dark: .dark
        case .auto: nil
        }
    }
}
