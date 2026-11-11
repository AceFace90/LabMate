import SwiftUI

/// Port of MarkerDetail.tsx in the Health "metric detail" style.
struct MarkerDetailView: View {
    let markerKey: String
    @Environment(AppStore.self) private var store

    @State private var showAdd = false
    @State private var editing: MarkerResult?
    @State private var pendingDelete: MarkerResult?

    private var marker: MarkerDef? { MarkerCatalog.marker(markerKey) }
    private var custom: CustomMarker? { marker == nil ? MarkerCatalog.findCustom(store.customMarkers, key: markerKey) : nil }
    private var label: String { marker?.label ?? custom?.label ?? markerKey }
    private var color: Color { markerDomainColor(marker?.category) }

    /// Newest first (ISO dates sort lexically).
    private var rows: [MarkerResult] {
        store.allResults.filter { $0.markerKey == markerKey }.sorted { $0.date > $1.date }
    }
    private var numeric: [MarkerResult] { rows.filter { $0.value != nil } }
    private var unit: String {
        let first = rows.first?.unit ?? ""
        return !first.isEmpty ? first : (marker?.defaultUnit ?? custom?.unit ?? "")
    }

    var body: some View {
        let latest = numeric.first
        let range = latest.map { HealthScore.effectiveRange($0, marker) }
        let story = MarkerStory.make(label: label, unit: unit, points: numeric.reversed(), marker: marker)

        HealthPage {
            VStack(alignment: .leading, spacing: 8) {
                Text(story.headline).healthHeadline().fixedSize(horizontal: false, vertical: true)
                    .accessibilityAddTraits(.isHeader)
                Text(story.narrative).healthNarrative()
                if let d = marker?.description, !d.isEmpty {
                    Text(d).font(.subheadline).foregroundStyle(.secondary).padding(.top, 4)
                }
            }

            HealthCard {
                MarkerTrendChart(results: numeric, unit: unit, marker: marker, color: color)
                if let range, let caption = MarkerFormat.rangeCaption(low: range.low, high: range.high) {
                    Divider()
                    HStack(spacing: 6) {
                        Text("\(caption) \(unit)".trimmingCharacters(in: .whitespaces).uppercased())
                            .font(.subheadline.weight(.semibold))
                        if range.isStandard { MarkerBadge(text: "General range") }
                        Spacer()
                    }
                    .accessibilityElement(children: .combine)
                    .accessibilityLabel("Reference range \(caption) \(unit)\(range.isStandard ? ", general range, not printed by a lab" : "")")
                }
            }

            if markerKey == "creatinine" { creatineNote }
            if !numeric.isEmpty { metricRows(latest: latest!) }
            historySection
        }
        .navigationTitle(label)
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            ToolbarItem(placement: .primaryAction) {
                Button("Add Result", systemImage: "plus") { showAdd = true }
            }
        }
        .sheet(isPresented: $showAdd) {
            let printed = rows.first { $0.rangeLow != nil || $0.rangeHigh != nil }
            AddResultSheet(markerKey: markerKey, label: label, unit: unit,
                           prefillLow: printed?.rangeLow, prefillHigh: printed?.rangeHigh) { store.addManualResult($0) }
        }
        .sheet(item: $editing) { r in
            EditResultSheet(result: r, onSave: { store.updateResult(id: r.id, patch: $0) }, onDelete: { store.deleteResult(id: r.id) })
        }
        .confirmationDialog("Delete this result?", isPresented: Binding(get: { pendingDelete != nil }, set: { if !$0 { pendingDelete = nil } }), titleVisibility: .visible) {
            Button("Delete", role: .destructive) { if let r = pendingDelete { store.deleteResult(id: r.id) }; pendingDelete = nil }
        } message: { Text("This can't be undone.") }
    }

    // MARK: Creatine note

    private var creatineNote: some View {
        HealthCard {
            Label("Creatine and creatinine", systemImage: "info.circle.fill")
                .font(.headline).foregroundStyle(HealthColor.vitals)
            Text(store.profile.takesCreatineSupplement == true
                 ? "You've flagged creatine supplementation, which raises creatinine independent of kidney function. Treat a high result with caution and consider Cystatin C, which creatine doesn't affect."
                 : "Creatine supplements raise creatinine independent of kidney function. If you take creatine, set it in your profile and consider Cystatin C for a cleaner kidney reading.")
                .font(.subheadline).foregroundStyle(.secondary)
        }
    }

    // MARK: Metric rows

    private func metricRows(latest: MarkerResult) -> some View {
        let values = numeric.compactMap(\.value)
        let previous = numeric.dropFirst().first
        let hi = numeric.max { ($0.value ?? 0) < ($1.value ?? 0) }
        let lo = numeric.min { ($0.value ?? 0) < ($1.value ?? 0) }
        let avg = values.reduce(0, +) / Double(values.count)
        let status = HealthScore.markerStatus(latest, marker)
        return HealthCard(padding: 0) {
            VStack(spacing: 0) {
                MetricRow(title: "Latest", value: "\(latest.displayValue) \(unit)", color: color, status: status, action: tap(latest))
                if let previous, let pv = previous.value {
                    Divider().padding(.leading, 18)
                    MetricRow(title: "Previous", value: "\(MarkerFormat.number(pv)) \(unit)", color: color, action: tap(previous))
                }
                if numeric.count > 1, let hi, let lo, let h = hi.value, let l = lo.value {
                    Divider().padding(.leading, 18)
                    MetricRow(title: "Highest", value: "\(MarkerFormat.number(h)) \(unit)", color: color, action: tap(hi))
                    Divider().padding(.leading, 18)
                    MetricRow(title: "Lowest", value: "\(MarkerFormat.number(l)) \(unit)", color: color, action: tap(lo))
                    Divider().padding(.leading, 18)
                    MetricRow(title: "Average", value: "\(MarkerFormat.number(avg)) \(unit)", color: color, action: nil)
                }
            }
        }
    }

    /// Derived results can't be edited, so no chevron/action.
    private func tap(_ r: MarkerResult) -> (() -> Void)? {
        r.derived == true ? nil : { editing = r }
    }

    // MARK: History

    private var historySection: some View {
        VStack(alignment: .leading, spacing: 10) {
            Text("History").font(.title2.bold()).padding(.horizontal, 4).accessibilityAddTraits(.isHeader)
            if rows.isEmpty {
                HealthCard {
                    Text(marker?.manualOnly == true ? "Nothing logged yet. Add a result by hand." : "No results yet. Import a report or add one by hand.")
                        .foregroundStyle(.secondary)
                }
            } else {
                HealthCard(padding: 0) {
                    VStack(spacing: 0) {
                        ForEach(Array(rows.enumerated()), id: \.element.id) { i, r in
                            if i > 0 { Divider().padding(.leading, 18) }
                            HistoryRow(result: r, marker: marker, unit: unit,
                                       onEdit: r.derived == true ? nil : { editing = r },
                                       onDelete: r.derived == true ? nil : { pendingDelete = r })
                        }
                    }
                }
            }
            Button { showAdd = true } label: { HealthLinkLabel(title: "Add a result by hand", color: color, symbol: "plus.circle.fill") }
                .padding(.horizontal, 4).padding(.top, 4)
        }
    }
}

/// "Resting Heart Rate  55 BPM >" style row in the domain colour.
struct MetricRow: View {
    let title: String
    let value: String
    let color: Color
    var status: MarkerStatus? = nil
    var action: (() -> Void)?

    var body: some View {
        if let action {
            Button(action: action) { content(chevron: true) }.buttonStyle(.plain)
        } else {
            content(chevron: false)
        }
    }

    private func content(chevron: Bool) -> some View {
        HStack(spacing: 8) {
            Text(title).font(.headline).foregroundStyle(color)
            Spacer()
            if let status, status != .unknown { StatusDot(status: status) }
            Text(value.trimmingCharacters(in: .whitespaces)).font(.headline).foregroundStyle(color)
            if chevron { Image(systemName: "chevron.right").font(.caption.weight(.semibold)).foregroundStyle(.tertiary) }
        }
        .padding(.horizontal, 18).padding(.vertical, 14)
        .contentShape(Rectangle())
        .accessibilityElement(children: .combine)
        .accessibilityLabel("\(title), \(value)\(status.map { ", \($0.title)" } ?? "")")
    }
}

private struct HistoryRow: View {
    let result: MarkerResult
    let marker: MarkerDef?
    let unit: String
    let onEdit: (() -> Void)?
    let onDelete: (() -> Void)?

    var body: some View {
        let range = HealthScore.effectiveRange(result, marker)
        let status = HealthScore.markerStatus(result, marker)
        let rangeText: String? = !result.rangeText.isEmpty ? result.rangeText
            : (range.isStandard ? marker?.standardRangeText.map { "\($0) (general)" } : nil)
        let source = result.derived == true ? "Calculated" : (result.addedManually ? "Manual entry" : result.sourceFile)

        Button { onEdit?() } label: {
            VStack(alignment: .leading, spacing: 8) {
                HStack(spacing: 8) {
                    StatusDot(status: status, isStandard: range.isStandard)
                    Text("\(result.displayValue) \(result.unit.isEmpty ? unit : result.unit)").font(.headline)
                    if HealthScore.showLabFlag(result, marker) { MarkerBadge(text: "Flagged", color: HealthColor.serious) }
                    if result.derived == true { MarkerBadge(text: "Calculated", color: HealthColor.vitals) }
                    Spacer()
                    Text(DateUtils.formatIsoDate(result.date)).font(.subheadline).foregroundStyle(.secondary)
                    if onEdit != nil { Image(systemName: "chevron.right").font(.caption.weight(.semibold)).foregroundStyle(.tertiary) }
                }
                if let v = result.value, range.low != nil || range.high != nil {
                    MarkerRangeBar(value: v, low: range.low, high: range.high, status: status, isStandard: range.isStandard)
                }
                HStack {
                    Text(rangeText.map { "Range \($0)" } ?? "No range").font(.caption).foregroundStyle(.secondary)
                    Spacer()
                    Text(source).font(.caption).foregroundStyle(.tertiary).lineLimit(1)
                }
            }
            .padding(.horizontal, 18).padding(.vertical, 14)
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .disabled(onEdit == nil)
        .accessibilityElement(children: .ignore)
        .accessibilityLabel("\(DateUtils.formatIsoDate(result.date)), \(result.displayValue) \(unit), \(status.title)\(HealthScore.showLabFlag(result, marker) ? ", flagged" : ""), source \(source)")
        .accessibilityHint(onEdit != nil ? "Opens editor" : "")
        .contextMenu {
            if let onEdit { Button("Edit", systemImage: "pencil", action: onEdit) }
            if let onDelete { Button("Delete", systemImage: "trash", role: .destructive, action: onDelete) }
        }
    }
}
