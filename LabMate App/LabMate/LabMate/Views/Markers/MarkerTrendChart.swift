import SwiftUI
import Charts

/// Port of TrendChart.tsx in Apple Health's style: points (with a faint connecting line),
/// the latest value highlighted in the domain colour, and a shaded reference-range band.
struct MarkerTrendChart: View {
    /// Numeric results, any order.
    let results: [MarkerResult]
    let unit: String
    let marker: MarkerDef?
    var color: Color = HealthColor.vitals

    @State private var selectedDate: Date?

    private struct Point: Identifiable {
        let id: String
        let date: Date
        let value: Double
        let result: MarkerResult
    }

    private var points: [Point] {
        results.compactMap { r in
            guard let v = r.value, let d = DateUtils.date(fromIso: r.date) else { return nil }
            return Point(id: r.id, date: d, value: v, result: r)
        }
        .sorted { $0.date < $1.date }
    }

    var body: some View {
        let pts = points
        if let latest = pts.last {
            let range = HealthScore.effectiveRange(latest.result, marker)
            let selected = selectedDate.flatMap { nearest(to: $0, in: pts) }
            let shown = selected ?? latest
            VStack(alignment: .leading, spacing: 8) {
                readout(shown, isLatest: selected == nil)
                chart(pts, latest: latest, range: range, selected: selected)
                    .frame(height: 240)
            }
            .accessibilityElement(children: .contain)
            .accessibilityLabel(summaryLabel(pts))
        } else {
            VStack(spacing: 8) {
                Image(systemName: "chart.xyaxis.line").font(.largeTitle).foregroundStyle(.tertiary)
                Text("No numeric results to chart yet.").font(.subheadline).foregroundStyle(.secondary)
            }
            .frame(maxWidth: .infinity, minHeight: 140)
        }
    }

    private func chart(_ pts: [Point], latest: Point, range: EffectiveRange, selected: Point?) -> some View {
        let values = pts.map(\.value) + [range.low, range.high].compactMap { $0 }
        let lo = values.min() ?? 0, hi = values.max() ?? 1
        let pad = (hi - lo == 0 ? max(abs(hi) * 0.1, 1) : (hi - lo)) * 0.2
        return Chart {
            if range.low != nil || range.high != nil {
                RectangleMark(
                    yStart: .value("Range low", range.low ?? lo - pad),
                    yEnd: .value("Range high", range.high ?? hi + pad)
                )
                .foregroundStyle(HealthColor.good.opacity(range.isStandard ? 0.10 : 0.18))
                .accessibilityHidden(true)
            }
            if pts.count > 1 {
                ForEach(pts) { p in
                    LineMark(x: .value("Date", p.date), y: .value("Value", p.value))
                        .foregroundStyle(color.opacity(0.35))
                        .lineStyle(StrokeStyle(lineWidth: 2, lineCap: .round, lineJoin: .round))
                        .interpolationMethod(.monotone)
                }
            }
            ForEach(pts) { p in
                let isLatest = p.id == latest.id
                PointMark(x: .value("Date", p.date), y: .value("Value", p.value))
                    .symbolSize(isLatest ? 150 : 60)
                    .foregroundStyle(HealthScore.showLabFlag(p.result, marker) ? HealthColor.serious : (isLatest ? color : color.opacity(0.55)))
                    .accessibilityLabel(DateUtils.formatIsoDate(p.result.date))
                    .accessibilityValue("\(p.result.displayValue) \(unit)")
            }
            if let selected {
                RuleMark(x: .value("Selected", selected.date))
                    .foregroundStyle(Color.secondary.opacity(0.5))
                    .lineStyle(StrokeStyle(lineWidth: 1))
            }
        }
        .chartYScale(domain: (lo - pad)...(hi + pad))
        .chartXSelection(value: $selectedDate)
        .chartYAxis {
            AxisMarks(position: .trailing, values: .automatic(desiredCount: 4)) { _ in
                AxisGridLine().foregroundStyle(Color.secondary.opacity(0.2))
                AxisValueLabel().foregroundStyle(Color.secondary)
            }
        }
        .chartXAxis {
            AxisMarks(values: .automatic(desiredCount: 3)) { _ in
                AxisValueLabel(format: .dateTime.month(.abbreviated).year(.twoDigits)).foregroundStyle(Color.secondary)
            }
        }
    }

    private func readout(_ p: Point, isLatest: Bool) -> some View {
        VStack(alignment: .leading, spacing: 2) {
            Text(isLatest ? "LATEST" : "SELECTED")
                .font(.caption.weight(.semibold)).foregroundStyle(.secondary)
            HStack(alignment: .firstTextBaseline, spacing: 4) {
                Text(p.result.displayValue.isEmpty ? MarkerFormat.number(p.value) : p.result.displayValue)
                    .font(.system(size: 34, weight: .bold, design: .rounded))
                    .contentTransition(.numericText())
                Text(unit).font(.title3.weight(.semibold)).foregroundStyle(.secondary)
                if HealthScore.showLabFlag(p.result, marker) { MarkerBadge(text: "Flagged", color: HealthColor.serious) }
            }
            Text(DateUtils.formatIsoDate(p.result.date)).font(.subheadline).foregroundStyle(.secondary)
        }
    }

    private func nearest(to date: Date, in pts: [Point]) -> Point? {
        pts.min { abs($0.date.timeIntervalSince(date)) < abs($1.date.timeIntervalSince(date)) }
    }

    private func summaryLabel(_ pts: [Point]) -> String {
        guard let last = pts.last, let first = pts.first else { return "No chart data" }
        return "Trend chart, \(pts.count) results from \(DateUtils.formatIsoDate(first.result.date)) to \(DateUtils.formatIsoDate(last.result.date)). Latest \(last.result.displayValue) \(unit)."
    }
}
