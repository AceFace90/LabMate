import SwiftUI

/// App-wide navigation requests (e.g. Insights "View all in Heart Health ›" jumping to Markers).
@Observable final class AppRouter {
    enum Tab: Hashable { case insights, markers, plan, settings }
    var tab: Tab = .insights
    /// Category the Markers tab should scroll to next time it appears.
    var markersScrollTarget: MarkerCategory?
    var showImport = false

    func goToMarkers(_ category: MarkerCategory? = nil) {
        markersScrollTarget = category
        tab = .markers
    }
}

/// Floating Liquid Glass tab bar, like the redesigned Health app (Insights / Markers / Test Plan / Settings),
/// mapped onto LabMate's sections. Import is a sheet triggered from a toolbar "+" on each tab.
struct RootView: View {
    @Environment(AppStore.self) private var store
    @State private var router = AppRouter()

    var body: some View {
        Group {
            if store.shouldShowSplash {
                SplashView()
            } else {
                TabView(selection: $router.tab) {
                    Tab("Insights", systemImage: "heart.fill", value: AppRouter.Tab.insights) {
                        InsightsView()
                    }
                    Tab("Markers", systemImage: "drop.fill", value: AppRouter.Tab.markers) {
                        MarkersView()
                    }
                    Tab("Test Plan", systemImage: "calendar.badge.checkmark", value: AppRouter.Tab.plan) {
                        TestPlanView()
                    }
                    Tab("Settings", systemImage: "gearshape.fill", value: AppRouter.Tab.settings) {
                        SettingsView()
                    }
                }
                .tint(HealthColor.heart)
                .tabBarMinimizeBehavior(.onScrollDown)
                .sheet(isPresented: $router.showImport) {
                    ImportView()
                }
            }
        }
        .environment(router)
        .alert("Something went wrong", isPresented: Binding(get: { store.authError != nil }, set: { if !$0 { store.clearError() } })) {
            Button("OK", role: .cancel) { store.clearError() }
        } message: {
            Text(store.authError ?? "")
        }
    }
}

/// Toolbar "+" that opens the import sheet - add to every tab's NavigationStack.
struct ImportToolbarButton: ToolbarContent {
    @Environment(AppRouter.self) private var router
    var body: some ToolbarContent {
        ToolbarItem(placement: .topBarTrailing) {
            Button("Import results", systemImage: "plus") { router.showImport = true }
        }
    }
}
