import SwiftUI

/// Markers tab: port of MarkerGrid.tsx (category sections, status, range bar, custom metrics)
/// plus the NavigationStack/detail wiring from App.tsx.
struct MarkersView: View {
    @Environment(AppStore.self) private var store
    @Environment(AppRouter.self) private var router

    @State private var path: [MarkerRoute] = []
    @State private var query = ""
    @State private var showAddCustom = false

    var body: some View {
        NavigationStack(path: $path) {
            ScrollViewReader { proxy in
                MarkersContent(
                    results: store.allResults, customMarkers: store.customMarkers, sex: store.profile.sex,
                    query: query, onAddCustom: { showAddCustom = true }
                )
                .onAppear { scrollIfNeeded(proxy) }
                .onChange(of: router.markersScrollTarget) { _, _ in scrollIfNeeded(proxy) }
            }
            .navigationTitle("Markers")
            .navigationBarTitleDisplayMode(.large)
            .navigationDestination(for: MarkerRoute.self) { MarkerDetailView(markerKey: $0.key) }
            .searchable(text: $query, prompt: "Search markers")
            .toolbar { ImportToolbarButton() }
            .sheet(isPresented: $showAddCustom) {
                AddCustomMarkerSheet { store.addCustomMarker(label: $0, unit: $1) }
            }
        }
        .onChange(of: router.tab) { _, tab in if tab == .markers, router.markersScrollTarget != nil { path = [] } }
    }

    private func scrollIfNeeded(_ proxy: ScrollViewProxy) {
        guard let target = router.markersScrollTarget else { return }
        path = []
        Task { @MainActor in
            withAnimation { proxy.scrollTo(target, anchor: .top) }
            router.markersScrollTarget = nil
        }
    }
}

/// Pure presentation of the grouped grid; separated so previews can feed sample data.
struct MarkersContent: View {
    let results: [MarkerResult]
    let customMarkers: [CustomMarker]
    let sex: Sex?
    var query = ""
    var onAddCustom: () -> Void = {}

    private var latest: [String: MarkerResult] { HealthScore.latestResultByMarker(results) }

    private func matches(_ text: String) -> Bool {
        query.isEmpty || text.localizedCaseInsensitiveContains(query)
    }

    var body: some View {
        let latest = latest
        let searching = !query.isEmpty
        HealthPage {
            ForEach(MarkerCatalog.categories.filter { $0.key != .custom }) { cat in
                let markers = MarkerCatalog.all.filter {
                    $0.category == cat.key && HealthScore.appliesToSex($0, sex)
                        && (matches($0.label) || matches(cat.label) || $0.aliases.contains(where: matches))
                }
                if !markers.isEmpty {
                    CategorySection(cat: cat, markers: markers, latest: latest).id(cat.key)
                }
            }
            let customs = customMarkers.filter { matches($0.label) || matches("Custom Metrics") }
            if !customs.isEmpty || !searching {
                customSection(customs, latest: latest).id(MarkerCategory.custom)
            }
            if searching && !hasAnyMatch {
                ContentUnavailableView.search(text: query).frame(maxWidth: .infinity)
            }
        }
    }

    private var hasAnyMatch: Bool {
        MarkerCatalog.all.contains { HealthScore.appliesToSex($0, sex) && (matches($0.label) || $0.aliases.contains(where: matches)) }
            || customMarkers.contains { matches($0.label) }
    }

    private func customSection(_ customs: [CustomMarker], latest: [String: MarkerResult]) -> some View {
        let def = MarkerCatalog.categories.first { $0.key == .custom }
        return VStack(alignment: .leading, spacing: 10) {
            SectionHeader(category: .custom, title: def?.label ?? "Custom Metrics", subtitle: def?.description ?? "")
            HealthCard(padding: 0) {
                VStack(spacing: 0) {
                    ForEach(Array(customs.enumerated()), id: \.element.key) { i, m in
                        if i > 0 { Divider().padding(.leading, 18) }
                        NavigationLink(value: MarkerRoute(key: m.key)) {
                            MarkerRow(label: m.label, result: latest[m.key], marker: nil, fallbackUnit: m.unit, manualHint: "Log manually", color: markerDomainColor(.custom))
                        }
                        .buttonStyle(.plain)
                    }
                    if !customs.isEmpty { Divider().padding(.leading, 18) }
                    Button(action: onAddCustom) {
                        HealthLinkLabel(title: "Add custom metric", color: HealthColor.vitals, symbol: "plus.circle.fill")
                            .frame(maxWidth: .infinity, alignment: .leading)
                            .padding(.horizontal, 18).padding(.vertical, 14)
                    }
                    .buttonStyle(.plain)
                }
            }
        }
    }
}

private struct SectionHeader: View {
    let category: MarkerCategory
    let title: String
    let subtitle: String
    var body: some View {
        VStack(alignment: .leading, spacing: 2) {
            Label {
                Text(title).font(.title3.bold())
            } icon: {
                Image(systemName: HealthColor.categorySymbol(category)).foregroundStyle(HealthColor.category(category))
            }
            .accessibilityAddTraits(.isHeader)
            if !subtitle.isEmpty { Text(subtitle).font(.footnote).foregroundStyle(.secondary) }
        }
        .padding(.horizontal, 4)
    }
}

private struct CategorySection: View {
    let cat: CategoryDef
    let markers: [MarkerDef]
    let latest: [String: MarkerResult]

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            SectionHeader(category: cat.key, title: cat.label, subtitle: cat.description)
            HealthCard(padding: 0) {
                VStack(spacing: 0) {
                    ForEach(Array(markers.enumerated()), id: \.element.key) { i, m in
                        if i > 0 { Divider().padding(.leading, 18) }
                        NavigationLink(value: MarkerRoute(key: m.key)) {
                            MarkerRow(label: m.label, result: latest[m.key], marker: m, fallbackUnit: m.defaultUnit ?? "",
                                      manualHint: m.manualOnly ? "Log manually" : "Not tested yet", color: markerDomainColor(m.category))
                        }
                        .buttonStyle(.plain)
                    }
                }
            }
        }
    }
}

/// One marker row: name, latest value + unit, status dot and range bar.
private struct MarkerRow: View {
    let label: String
    let result: MarkerResult?
    let marker: MarkerDef?
    let fallbackUnit: String
    let manualHint: String
    let color: Color

    var body: some View {
        let range = result.map { HealthScore.effectiveRange($0, marker) }
        let status = result.map { HealthScore.markerStatus($0, marker) }
        HStack(alignment: .center, spacing: 10) {
            VStack(alignment: .leading, spacing: 6) {
                Text(label).font(.headline).foregroundStyle(.primary)
                if let r = result, let v = r.value, let range, let status, range.low != nil || range.high != nil {
                    MarkerRangeBar(value: v, low: range.low, high: range.high, status: status, isStandard: range.isStandard, showLabels: false)
                        .frame(maxWidth: 160)
                }
            }
            Spacer(minLength: 8)
            if let r = result, let status {
                HStack(spacing: 6) {
                    StatusDot(status: status, isStandard: range?.isStandard ?? false)
                    Text(r.displayValue).font(.headline).foregroundStyle(color)
                    Text(r.unit.isEmpty ? fallbackUnit : r.unit).font(.subheadline).foregroundStyle(.secondary).lineLimit(1)
                }
            } else {
                Text(manualHint).font(.subheadline).foregroundStyle(.secondary)
            }
            Image(systemName: "chevron.right").font(.caption.weight(.semibold)).foregroundStyle(.tertiary)
        }
        .padding(.horizontal, 18).padding(.vertical, 14)
        .contentShape(Rectangle())
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(accessibility(status: status))
    }

    private func accessibility(status: MarkerStatus?) -> String {
        guard let r = result, let status else { return "\(label), \(manualHint)" }
        return "\(label), \(r.displayValue) \(r.unit.isEmpty ? fallbackUnit : r.unit), \(status.title)"
    }
}

// MARK: - Previews

enum MarkerPreviewData {
    static func result(_ key: String, _ date: String, _ v: Double, low: Double? = nil, high: Double? = nil, unit: String = "mmol/L", flag: ResultFlag = .none) -> MarkerResult {
        MarkerResult(id: "\(key)-\(date)", markerKey: key, rawName: key, date: date, value: v,
                     displayValue: MarkerFormat.number(v), flag: flag, rangeLow: low, rangeHigh: high,
                     rangeText: MarkerFormat.rangeCaption(low: low, high: high) ?? "", unit: unit,
                     sourceFile: "report.pdf", panel: "Lipids", addedManually: false, derived: nil, createdAt: "")
    }
    static let results: [MarkerResult] = [
        result("ldl_cholesterol", "2025-03-01", 3.6, high: 3.0),
        result("ldl_cholesterol", "2025-09-01", 3.1, high: 3.0),
        result("ldl_cholesterol", "2026-03-01", 2.7, high: 3.0, flag: .none),
        result("sodium", "2026-03-01", 141),
        result("creatinine", "2026-03-01", 118, unit: "umol/L"),
        result("hba1c", "2026-03-01", 5.2, unit: "%"),
    ]
}

#Preview("Markers") {
    NavigationStack {
        MarkersContent(results: MarkerPreviewData.results, customMarkers: [CustomMarker(key: "custom_sleep", label: "Sleep score", unit: "/100", createdAt: "")], sex: .M)
            .navigationTitle("Markers")
    }
}

#Preview("Markers dark") {
    NavigationStack {
        MarkersContent(results: MarkerPreviewData.results, customMarkers: [], sex: nil)
            .navigationTitle("Markers")
    }
    .preferredColorScheme(.dark)
}

#Preview("Detail") {
    NavigationStack { MarkerDetailView(markerKey: "ldl_cholesterol") }
        .environment(AppStore())
}
