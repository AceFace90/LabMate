import SwiftUI

extension View {
    /// Rings and gauges are drawn shapes, so give them one spoken label.
    func chartAccessibility(_ label: String) -> some View {
        accessibilityElement(children: .ignore).accessibilityLabel(label)
    }
}

func clamp01(_ n: Double) -> Double { max(0, min(1, n)) }

struct InsightsSectionTitle: View {
    let title: String
    var subtitle: String?
    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            Text(title).font(.title2.bold()).accessibilityAddTraits(.isHeader)
            if let subtitle { Text(subtitle).font(.callout).foregroundStyle(.secondary) }
        }
    }
}

/// Label/value rows separated by hairlines, the "detail table" inside a card.
struct DetailTable: View {
    let rows: [(String, String)]
    var body: some View {
        VStack(spacing: 0) {
            ForEach(Array(rows.enumerated()), id: \.offset) { i, row in
                if i > 0 { Divider() }
                HStack {
                    Text(row.0).foregroundStyle(.secondary)
                    Spacer(minLength: 12)
                    Text(row.1).fontWeight(.medium).multilineTextAlignment(.trailing)
                }
                .font(.subheadline)
                .padding(.vertical, 8)
                .accessibilityElement(children: .combine)
            }
        }
    }
}

struct CardNarrative: View {
    let text: String
    var body: some View {
        Text(text).font(.callout).foregroundStyle(.secondary).fixedSize(horizontal: false, vertical: true)
    }
}

struct InsightsCaveat: View {
    let text: String
    var body: some View {
        Text(text).font(.footnote).foregroundStyle(.secondary).fixedSize(horizontal: false, vertical: true)
    }
}

/// Small status bar showing where a value sits against its range.
struct RangeBar: View {
    let value: Double
    let low: Double?
    let high: Double?
    var color: Color = HealthColor.serious

    var body: some View {
        if let low, let high, high > low {
            let span = high - low
            let lo = low - span * 0.5
            let hi = high + span * 0.5
            GeometryReader { geo in
                let w = geo.size.width
                ZStack(alignment: .leading) {
                    Capsule().fill(HealthColor.track)
                    Capsule().fill(HealthColor.good.opacity(0.35))
                        .frame(width: w / 3).offset(x: w / 3)
                    Circle().fill(color).frame(width: 12, height: 12)
                        .offset(x: clamp01((value - lo) / (hi - lo)) * (w - 12))
                }
            }
            .frame(height: 12)
            .accessibilityHidden(true)
        }
    }
}

// MARK: - Chip strip

struct InsightsChipStrip: View {
    let model: InsightsModel
    let selected: InsightsSection?
    let onSelect: (InsightsSection) -> Void

    var body: some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: 10) {
                chip("Bio Age", bioValue, .bioAge, target: model.hasBirthDate ? .bioAge : .hero) {
                    ring(bioFraction, bioColor)
                }
                chip("In Range", model.overall.percentInRange.map { "\($0)%" } ?? "\u{2013}", .inRange) {
                    ring(Double(model.overall.percentInRange ?? 0) / 100,
                         model.overall.outOfRangeCount > 0 ? HealthColor.serious : HealthColor.good)
                }
                chip("Coverage", "\(model.overall.testedMarkers) of \(model.overall.totalMarkers)", .coverage) {
                    ring(model.overall.totalMarkers > 0 ? Double(model.overall.testedMarkers) / Double(model.overall.totalMarkers) : 0,
                         HealthColor.vitals)
                }
                chip("Findings", model.findings.isEmpty ? "None" : "\(model.findings.count)", .findings) {
                    Image(systemName: "list.clipboard.fill")
                        .font(.title3)
                        .foregroundStyle(model.findings.isEmpty ? HealthColor.good : HealthColor.serious)
                        .accessibilityHidden(true)
                }
            }
            .padding(.horizontal, HealthMetrics.pagePadding)
        }
    }

    private var bioValue: String { model.bioAge.map { InsightsNarrative.decimal($0.phenoAge) } ?? "\u{2013}" }
    private var bioFraction: Double { model.bioAge.map { clamp01(0.5 + $0.delta / 20) } ?? 0 }
    private var bioColor: Color { (model.bioAge?.delta ?? 0) <= 0 ? HealthColor.good : HealthColor.serious }

    private func ring(_ f: Double, _ c: Color) -> some View {
        ScoreRing(segments: [(clamp01(f), c)], label: "", lineWidth: 5, size: 30)
            .accessibilityHidden(true)
    }

    private func chip<Icon: View>(_ title: String, _ value: String, _ section: InsightsSection,
                                  target: InsightsSection? = nil,
                                  @ViewBuilder icon: () -> Icon) -> some View {
        Button { onSelect(target ?? section) } label: {
            SummaryChip(title: title, value: value, selected: selected == section, icon: icon)
        }
        .buttonStyle(.plain)
        .accessibilityElement(children: .ignore)
        .accessibilityLabel("\(title), \(value)")
        .accessibilityHint("Scrolls to this section")
    }
}

// MARK: - Hero

struct InsightsHero: View {
    let model: InsightsModel

    var body: some View {
        VStack(alignment: .leading, spacing: 14) {
            InsightsGreeting(name: model.firstName)
            visual.frame(maxWidth: .infinity)
            Text(InsightsNarrative.heroHeadline(model)).healthHeadline()
            Text(InsightsNarrative.heroNarrative(model)).healthNarrative()
            if let d = model.lastUpdated {
                Text("Last result \(DateUtils.formatIsoDate(d))").font(.footnote).foregroundStyle(.secondary)
            }
        }
    }

    @ViewBuilder private var visual: some View {
        if let bio = model.bioAge {
            let color = bio.delta <= 0 ? HealthColor.good : HealthColor.serious
            GaugeArc(progress: clamp01(0.5 + bio.delta / 20),
                     label: InsightsNarrative.decimal(bio.phenoAge), color: color)
                .chartAccessibility("Biological age \(InsightsNarrative.decimal(bio.phenoAge)), calendar age \(bio.chronologicalAge), \(InsightsNarrative.signedYears(bio.delta)) years")
        } else {
            let o = model.overall
            let tested = Double(max(o.testedMarkers, 1))
            let pct = o.percentInRange.map { "\($0)%" } ?? "\u{2013}"
            ScoreRing(segments: [(Double(o.inRangeCount) / tested, HealthColor.good),
                                 (Double(o.outOfRangeCount) / tested, HealthColor.serious)],
                      label: pct, lineWidth: 26, size: 220)
                .chartAccessibility("\(pct) of tested markers in range")
        }
    }
}
