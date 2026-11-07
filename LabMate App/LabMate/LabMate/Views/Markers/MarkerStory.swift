import SwiftUI

/// Generates the Health-style editorial headline + grey narrative for a marker from its data.
struct MarkerStory {
    let headline: String
    let narrative: String

    /// `points` must be numeric results sorted oldest -> newest.
    static func make(label: String, unit: String, points: [MarkerResult], marker: MarkerDef?) -> MarkerStory {
        guard let latest = points.last, let value = latest.value else {
            let hint = (marker?.manualOnly ?? false)
                ? "Log it by hand or sync it from Apple Health to start a trend."
                : "Import a report or add a result by hand to start a trend."
            return MarkerStory(headline: "No \(label) Yet", narrative: "You haven't recorded any numeric \(label) results. \(hint)")
        }

        let range = HealthScore.effectiveRange(latest, marker)
        let status = HealthScore.markerStatus(latest, marker)
        let u = unit.isEmpty ? "" : " \(unit)"
        let latestText = latest.displayValue.isEmpty ? MarkerFormat.number(value) : latest.displayValue
        var sentences = ["Your latest \(label) is \(latestText)\(u), recorded \(DateUtils.formatIsoDate(latest.date))."]

        var headline: String
        if points.count >= 2, let prev = points.dropLast().last, let pv = prev.value {
            let delta = value - pv
            let rel = abs(delta) / max(abs(pv), 0.0001)
            if rel < 0.02 {
                headline = "\(label) Steady"
                sentences.append("That's about the same as \(MarkerFormat.number(pv)) on \(DateUtils.formatIsoDate(prev.date)).")
            } else {
                headline = delta > 0 ? "\(label) Trending Up" : "\(label) Trending Down"
                let pctText = pv == 0 ? "" : " (\(Int((rel * 100).rounded()))%)"
                sentences.append("That's \(delta > 0 ? "up" : "down") \(MarkerFormat.number(abs(delta)))\(pctText) from \(MarkerFormat.number(pv)) on \(DateUtils.formatIsoDate(prev.date)).")
            }
        } else {
            switch status {
            case .in_range: headline = "\(label) In Range"
            case .low: headline = "\(label) Low"
            case .high: headline = "\(label) High"
            case .unknown: headline = "\(label) Recorded"
            }
        }

        if let caption = MarkerFormat.rangeCaption(low: range.low, high: range.high) {
            let kind = range.isStandard ? "general reference range" : "reference range"
            switch status {
            case .in_range: sentences.append("It sits within the \(kind) of \(caption)\(u).")
            case .low: sentences.append("That is below the \(kind) of \(caption)\(u).")
            case .high: sentences.append("That is above the \(kind) of \(caption)\(u).")
            case .unknown: break
            }
        }
        if points.count > 2, let first = points.first {
            sentences.append("Based on \(points.count) results since \(DateUtils.formatIsoDate(first.date)).")
        }
        return MarkerStory(headline: headline, narrative: sentences.joined(separator: " "))
    }
}
