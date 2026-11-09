import SwiftUI

// Design language modelled on the redesigned Apple Health app: grouped-grey canvas,
// white continuous-corner cards, large bold editorial headlines with a secondary-grey
// narrative paragraph, a horizontal strip of summary "chips" at the top, a floating
// Liquid Glass tab bar, and Health's per-domain accent colours.

nonisolated enum HealthColor {
    // Domain accents (Health uses one colour per domain: Heart=pink, Sleep=teal/indigo...)
    static let heart = Color(red: 1.00, green: 0.18, blue: 0.33)      // #FF2D55
    static let vitals = Color(red: 0.20, green: 0.48, blue: 1.00)     // readiness blue
    static let sleepTeal = Color(red: 0.19, green: 0.82, blue: 0.75)
    static let sleepIndigo = Color(red: 0.33, green: 0.36, blue: 0.95)
    static let fitness = Color(red: 0.62, green: 0.95, blue: 0.20)
    static let move = Color(red: 0.98, green: 0.07, blue: 0.31)
    static let orange = Color(red: 1.00, green: 0.45, blue: 0.30)
    static let purple = Color(red: 0.69, green: 0.32, blue: 0.87)

    // Status (in-range / borderline / out-of-range), matched to Health's tone.
    static let good = Color(red: 0.20, green: 0.78, blue: 0.35)
    static let warning = Color(red: 1.00, green: 0.80, blue: 0.00)
    static let serious = Color(red: 1.00, green: 0.58, blue: 0.00)
    static let critical = Color(red: 1.00, green: 0.23, blue: 0.19)

    static let canvas = Color(uiColor: .systemGroupedBackground)
    static let card = Color(uiColor: .secondarySystemGroupedBackground)
    static let track = Color(uiColor: .systemFill)
    static let narrative = Color.secondary

    static func category(_ c: MarkerCategory) -> Color {
        switch c {
        case .electrolytes_kidney: return sleepTeal
        case .liver: return orange
        case .iron: return Color(red: 0.75, green: 0.35, blue: 0.25)
        case .metabolic: return Color(red: 1.00, green: 0.62, blue: 0.04)
        case .heart_lipids: return heart
        case .blood_marrow: return critical
        case .hormones: return purple
        case .nutrition: return good
        case .gut_health: return Color(red: 0.55, green: 0.70, blue: 0.20)
        case .autoimmunity: return sleepIndigo
        case .cancer_screening: return Color(red: 0.90, green: 0.35, blue: 0.65)
        case .muscle: return vitals
        case .aerobic_fitness: return move
        case .body_composition: return Color(red: 0.35, green: 0.55, blue: 0.95)
        case .custom: return .gray
        }
    }

    static func categorySymbol(_ c: MarkerCategory) -> String {
        switch c {
        case .electrolytes_kidney: return "drop.fill"
        case .liver: return "cross.vial.fill"
        case .iron: return "atom"
        case .metabolic: return "flame.fill"
        case .heart_lipids: return "heart.fill"
        case .blood_marrow: return "drop.circle.fill"
        case .hormones: return "point.3.filled.connected.trianglepath.dotted"
        case .nutrition: return "leaf.fill"
        case .gut_health: return "allergens.fill"
        case .autoimmunity: return "shield.lefthalf.filled"
        case .cancer_screening: return "staroflife.fill"
        case .muscle: return "figure.strengthtraining.traditional"
        case .aerobic_fitness: return "figure.run"
        case .body_composition: return "figure.arms.open"
        case .custom: return "square.grid.2x2.fill"
        }
    }
}

nonisolated enum HealthMetrics {
    static let cardRadius: CGFloat = 26
    static let chipRadius: CGFloat = 18
    static let pagePadding: CGFloat = 20
    static let cardPadding: CGFloat = 18
}

// MARK: - Typography

extension View {
    /// Health's large editorial headline, e.g. "A Good Night's Sleep".
    func healthHeadline() -> some View {
        font(.system(size: 34, weight: .bold)).foregroundStyle(.primary)
    }
    /// The grey narrative paragraph under a headline.
    func healthNarrative() -> some View {
        font(.title3).foregroundStyle(HealthColor.narrative)
    }
    /// Small grey caption at the top of a card ("Sleep", "Readiness").
    func healthCardEyebrow() -> some View {
        font(.subheadline).foregroundStyle(.secondary)
    }
}

// MARK: - Card

struct HealthCard<Content: View>: View {
    var padding: CGFloat = HealthMetrics.cardPadding
    @ViewBuilder var content: Content

    var body: some View {
        VStack(alignment: .leading, spacing: 12) { content }
            .frame(maxWidth: .infinity, alignment: .leading)
            .padding(padding)
            .background(HealthColor.card, in: .rect(cornerRadius: HealthMetrics.cardRadius, style: .continuous))
    }
}

/// Card header: grey eyebrow + bold status line, optional trailing visual (ring/gauge).
struct HealthCardHeader<Trailing: View>: View {
    let eyebrow: String
    let title: String
    var titleColor: Color = .primary
    @ViewBuilder var trailing: Trailing

    var body: some View {
        HStack(alignment: .top) {
            VStack(alignment: .leading, spacing: 2) {
                Text(eyebrow).healthCardEyebrow()
                Text(title).font(.title3.weight(.semibold)).foregroundStyle(titleColor)
            }
            Spacer(minLength: 8)
            trailing
        }
    }
}

extension HealthCardHeader where Trailing == EmptyView {
    init(eyebrow: String, title: String, titleColor: Color = .primary) {
        self.init(eyebrow: eyebrow, title: title, titleColor: titleColor) { EmptyView() }
    }
}

/// Blue "✓ Vitals, Overnight ›" style link row used under "Raising Your Score".
struct HealthLinkLabel: View {
    let title: String
    var color: Color = HealthColor.vitals
    var symbol: String = "checkmark.circle.fill"
    var body: some View {
        HStack(spacing: 6) {
            Image(systemName: symbol)
            Text(title)
            Image(systemName: "chevron.right").font(.caption.weight(.semibold)).foregroundStyle(.tertiary)
        }
        .font(.headline)
        .foregroundStyle(color)
    }
}

// MARK: - Summary chip strip (top of Insights)

struct SummaryChip<Icon: View>: View {
    let title: String
    let value: String
    var selected: Bool = false
    @ViewBuilder var icon: Icon

    var body: some View {
        HStack(spacing: 10) {
            icon.frame(width: 34, height: 34)
            VStack(alignment: .leading, spacing: 0) {
                Text(title).font(.subheadline).foregroundStyle(.secondary)
                Text(value).font(.subheadline.weight(.semibold)).foregroundStyle(.primary)
            }
            .lineLimit(1)
        }
        .padding(.horizontal, 12)
        .padding(.vertical, 10)
        .background(selected ? HealthColor.card : HealthColor.card.opacity(0.6),
                    in: .rect(cornerRadius: HealthMetrics.chipRadius, style: .continuous))
        .overlay(
            RoundedRectangle(cornerRadius: HealthMetrics.chipRadius, style: .continuous)
                .strokeBorder(Color.primary.opacity(selected ? 0 : 0.06))
        )
        .shadow(color: .black.opacity(selected ? 0.08 : 0), radius: 8, y: 2)
    }
}

// MARK: - Score ring (Sleep "84" style: multi-segment ring with number in the middle)

struct ScoreRing: View {
    /// Segments as (fraction 0...1, colour), drawn sequentially around the ring.
    let segments: [(Double, Color)]
    let label: String
    var lineWidth: CGFloat = 14
    var size: CGFloat = 110

    var body: some View {
        ZStack {
            Circle().stroke(HealthColor.track, lineWidth: lineWidth)
            ForEach(Array(segmentRanges.enumerated()), id: \.offset) { _, seg in
                Circle()
                    .trim(from: seg.start, to: seg.end)
                    .stroke(seg.color, style: StrokeStyle(lineWidth: lineWidth, lineCap: .round))
                    .rotationEffect(.degrees(-90))
            }
            Text(label)
                .font(.system(size: size * 0.3, weight: .bold, design: .rounded))
                .minimumScaleFactor(0.5)
                .lineLimit(1)
                .padding(lineWidth)
        }
        .frame(width: size, height: size)
    }

    private var segmentRanges: [(start: Double, end: Double, color: Color)] {
        var cursor = 0.0
        var out: [(Double, Double, Color)] = []
        let gap = segments.count > 1 ? 0.02 : 0
        for (frac, color) in segments where frac > 0 {
            let end = min(1, cursor + frac)
            out.append((cursor, max(cursor, end - gap), color))
            cursor = end
        }
        return out.map { (start: $0.0, end: $0.1, color: $0.2) }
    }
}

// MARK: - Gauge arc (Readiness "7" style: 240° arc with a knob)

struct GaugeArc: View {
    /// 0...1 position of the knob along the arc.
    let progress: Double
    let label: String
    var color: Color = HealthColor.vitals
    var size: CGFloat = 260
    var lineWidth: CGFloat = 34

    private let sweep = 0.66 // fraction of a full circle the arc covers

    var body: some View {
        ZStack {
            Circle()
                .trim(from: 0, to: sweep)
                .stroke(HealthColor.track, style: StrokeStyle(lineWidth: lineWidth, lineCap: .round))
                .rotationEffect(.degrees(90 + (1 - sweep) * 180))
                .padding(lineWidth / 2) // keep the stroke centred on the same radius as the knob
            Circle()
                .trim(from: max(0, progress * sweep - 0.08), to: progress * sweep)
                .stroke(color.opacity(0.3), style: StrokeStyle(lineWidth: lineWidth, lineCap: .round))
                .rotationEffect(.degrees(90 + (1 - sweep) * 180))
                .padding(lineWidth / 2)
            knob
            Text(label)
                .font(.system(size: size * 0.32, weight: .semibold, design: .rounded))
                .foregroundStyle(color)
                .minimumScaleFactor(0.4)
                .lineLimit(1)
                .padding(.horizontal, lineWidth * 1.5)
        }
        .frame(width: size, height: size)
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(label)
    }

    private var knob: some View {
        GeometryReader { geo in
            let r = (min(geo.size.width, geo.size.height) - lineWidth) / 2
            let startAngle = 90 + (1 - sweep) * 180
            let angle = Angle.degrees(startAngle + progress * sweep * 360)
            Circle()
                .fill(color)
                .frame(width: lineWidth * 0.8, height: lineWidth * 0.8)
                .position(x: geo.size.width / 2 + r * cos(angle.radians),
                          y: geo.size.height / 2 + r * sin(angle.radians))
        }
    }
}

// MARK: - Page scaffold

/// Grouped-grey scrolling page with the standard Health horizontal padding.
struct HealthPage<Content: View>: View {
    @ViewBuilder var content: Content
    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 20) { content }
                .padding(.horizontal, HealthMetrics.pagePadding)
                .padding(.bottom, 32)
        }
        .background(HealthColor.canvas.ignoresSafeArea())
    }
}

#Preview("Components") {
    HealthPage {
        ScrollView(.horizontal) {
            HStack {
                SummaryChip(title: "Bio Age", value: "34.2", selected: true) {
                    ScoreRing(segments: [(0.7, HealthColor.good)], label: "", lineWidth: 5, size: 30)
                }
                SummaryChip(title: "In Range", value: "42 of 48") {
                    Image(systemName: "heart.fill").foregroundStyle(HealthColor.heart).font(.title2)
                }
            }
        }
        GaugeArc(progress: 0.72, label: "7").frame(maxWidth: .infinity)
        HealthCard {
            HealthCardHeader(eyebrow: "Sleep", title: "High Score") {
                ScoreRing(segments: [(0.4, HealthColor.sleepTeal), (0.2, HealthColor.orange), (0.24, HealthColor.sleepIndigo)], label: "84")
            }
        }
    }
}
