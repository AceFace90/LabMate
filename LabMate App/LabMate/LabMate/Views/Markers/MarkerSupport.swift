import SwiftUI

// Shared formatting, status styling and small components for the Markers tab.

struct MarkerRoute: Hashable, Sendable {
    let key: String
}

enum MarkerFormat {
    /// Up to 2 decimals, no grouping, trailing zeros trimmed.
    static func number(_ v: Double) -> String {
        let f = NumberFormatter()
        f.numberStyle = .decimal
        f.usesGroupingSeparator = false
        f.minimumFractionDigits = 0
        f.maximumFractionDigits = 2
        return f.string(from: NSNumber(value: v)) ?? String(v)
    }

    /// "43–120", "< 3.0", "> 60" or nil when there is no range.
    static func rangeCaption(low: Double?, high: Double?) -> String? {
        switch (low, high) {
        case let (l?, h?): return "\(number(l))–\(number(h))"
        case let (nil, h?): return "< \(number(h))"
        case let (l?, nil): return "> \(number(l))"
        default: return nil
        }
    }

    /// Port of rangeFromInputs in MarkerDetail.tsx: optional low/high text -> stored range fields.
    static func rangeFields(low: String, high: String) -> (low: Double?, high: Double?, text: String) {
        let lowT = low.trimmingCharacters(in: .whitespaces)
        let highT = high.trimmingCharacters(in: .whitespaces)
        let lo = parse(lowT), hi = parse(highT)
        let text: String
        if lo != nil, hi != nil { text = "\(lowT) - \(highT)" }
        else if lo != nil { text = "> \(lowT)" }
        else if hi != nil { text = "< \(highT)" }
        else { text = "" }
        return (lo, hi, text)
    }

    static func parse(_ s: String) -> Double? {
        let t = s.trimmingCharacters(in: .whitespaces).replacingOccurrences(of: ",", with: ".")
        guard !t.isEmpty, let d = Double(t), d.isFinite else { return nil }
        return d
    }

    // Local-calendar ISO helpers for DatePicker (DateUtils is UTC-based and would shift days).
    static func localIso(_ date: Date) -> String {
        let c = Calendar.current.dateComponents([.year, .month, .day], from: date)
        return String(format: "%04d-%02d-%02d", c.year ?? 1970, c.month ?? 1, c.day ?? 1)
    }

    static func localDate(fromIso iso: String) -> Date {
        let p = iso.split(separator: "-").compactMap { Int($0) }
        guard p.count == 3 else { return Date() }
        return Calendar.current.date(from: DateComponents(year: p[0], month: p[1], day: p[2], hour: 12)) ?? Date()
    }

    /// Short axis/readout date, e.g. "5 Nov".
    static func shortDate(_ iso: String) -> String {
        guard let d = DateUtils.date(fromIso: iso) else { return iso }
        var cal = Calendar(identifier: .gregorian)
        cal.timeZone = TimeZone(identifier: "UTC")!
        let f = DateFormatter()
        f.calendar = cal
        f.timeZone = cal.timeZone
        f.setLocalizedDateFormatFromTemplate("dMMM")
        return f.string(from: d)
    }
}

extension MarkerStatus {
    /// Semantic status colours (adaptive via system colours inside HealthColor where possible).
    var color: Color {
        switch self {
        case .in_range: return HealthColor.good
        case .low, .high: return HealthColor.serious
        case .unknown: return Color.secondary
        }
    }

    var title: String {
        switch self {
        case .in_range: return "In Range"
        case .low: return "Low"
        case .high: return "High"
        case .unknown: return "No Range"
        }
    }
}

/// Domain colour for a marker. Custom metrics use the vitals blue rather than neutral grey.
func markerDomainColor(_ category: MarkerCategory?) -> Color {
    guard let category, category != .custom else { return HealthColor.vitals }
    return HealthColor.category(category)
}

struct StatusDot: View {
    let status: MarkerStatus
    var isStandard = false
    var body: some View {
        Circle()
            .fill(isStandard ? Color.clear : status.color)
            .overlay(Circle().strokeBorder(status.color, lineWidth: isStandard ? 1.5 : 0))
            .frame(width: 10, height: 10)
            .accessibilityHidden(true)
    }
}

/// Small capsule such as "Calculated" or "Flagged".
struct MarkerBadge: View {
    let text: String
    var color: Color = .secondary
    var body: some View {
        Text(text)
            .font(.caption2.weight(.semibold))
            .foregroundStyle(color)
            .padding(.horizontal, 7)
            .padding(.vertical, 2)
            .background(color.opacity(0.14), in: .capsule)
    }
}

/// Port of RangeBar.tsx: a proportional position indicator, not a clinical severity scale.
struct MarkerRangeBar: View {
    let value: Double
    let low: Double?
    let high: Double?
    let status: MarkerStatus
    var isStandard = false
    var showLabels = true

    private struct Layout { var bandStart: Double; var bandEnd: Double; var valuePct: Double }

    private var layout: Layout? {
        if low == nil && high == nil { return nil }
        let dMin: Double, dMax: Double, bs: Double, be: Double
        if let low, let high {
            var pad = (high - low) * 0.25
            if pad == 0 { pad = abs(high) * 0.25 }
            if pad == 0 { pad = 1 }
            dMin = low - pad; dMax = high + pad
            bs = pct(low, dMin, dMax); be = pct(high, dMin, dMax)
        } else if let high {
            dMin = 0; dMax = high * 1.5 == 0 ? 1 : high * 1.5
            bs = 0; be = pct(high, dMin, dMax)
        } else {
            let l = low ?? 0
            dMin = 0; dMax = l * 2 == 0 ? 1 : l * 2
            bs = pct(l, dMin, dMax); be = 100
        }
        return Layout(bandStart: bs, bandEnd: be, valuePct: min(100, max(0, pct(value, dMin, dMax))))
    }

    private func pct(_ v: Double, _ lo: Double, _ hi: Double) -> Double {
        hi == lo ? 50 : (v - lo) / (hi - lo) * 100
    }

    var body: some View {
        if let g = layout {
            VStack(spacing: 4) {
                GeometryReader { geo in
                    let w = geo.size.width
                    ZStack(alignment: .leading) {
                        Capsule().fill(HealthColor.track).frame(height: 6)
                        Capsule()
                            .fill(HealthColor.good.opacity(isStandard ? 0.18 : 0.45))
                            .overlay {
                                if isStandard {
                                    Capsule().strokeBorder(HealthColor.good, style: StrokeStyle(lineWidth: 1, dash: [3, 2]))
                                }
                            }
                            .frame(width: max(0, (g.bandEnd - g.bandStart) / 100 * w), height: 6)
                            .offset(x: g.bandStart / 100 * w)
                        Circle()
                            .fill(status.color)
                            .overlay(Circle().strokeBorder(HealthColor.card, lineWidth: 2))
                            .frame(width: 12, height: 12)
                            .offset(x: g.valuePct / 100 * w - 6)
                    }
                    .frame(height: 12)
                }
                .frame(height: 12)
                if showLabels {
                    HStack {
                        Text(low.map(MarkerFormat.number) ?? "")
                        Spacer()
                        Text(high.map(MarkerFormat.number) ?? "")
                    }
                    .font(.caption2)
                    .foregroundStyle(.secondary)
                }
            }
            .accessibilityHidden(true)
        }
    }
}
