import Foundation

// Port of src/lib/healthScore.ts.

/// Helpers to reproduce JavaScript number semantics where the web app's output depends on them.
nonisolated enum JSFormat {
    /// Math.round: rounds half toward +infinity (unlike Swift's default half-away-from-zero).
    static func round(_ x: Double) -> Double { (x + 0.5).rounded(.down) }

    /// String(number): "60" for whole numbers, shortest round-trip form otherwise.
    static func number(_ x: Double) -> String {
        if x.isFinite, x == x.rounded(), abs(x) < 1e15 { return String(Int64(x)) }
        return "\(x)"
    }
}

nonisolated enum MarkerStatus: String, Sendable { case in_range, low, high, unknown }

nonisolated struct EffectiveRange: Sendable, Equatable {
    var low: Double?
    var high: Double?
    /// True when this range came from the marker's general standard range, not the lab's own printed range.
    var isStandard: Bool
}

nonisolated struct CategoryCoverage: Sendable, Identifiable {
    var category: MarkerCategory
    var label: String
    var totalMarkers: Int
    var testedMarkers: Int
    var inRangeCount: Int
    var outOfRangeCount: Int
    var percentInRange: Int?
    var id: MarkerCategory { category }
}

nonisolated struct OverallCoverage: Sendable {
    var totalMarkers: Int
    var testedMarkers: Int
    var inRangeCount: Int
    var outOfRangeCount: Int
    var percentInRange: Int?
}

nonisolated enum HealthScore {
    /// True when a marker is relevant to the given sex - sex-specific markers (PSA, CA-125) are excluded for the other sex. Unset sex shows everything.
    static func appliesToSex(_ marker: MarkerDef, _ sex: Sex?) -> Bool {
        marker.sexSpecific == nil || sex == nil || marker.sexSpecific == sex
    }

    /**
     * A result's own printed range always wins. Only when a result has no printed
     * range at all do we fall back to the marker's general standard range, so a
     * tested value doesn't sit stuck as "unknown" just because a report omitted
     * its reference interval.
     */
    static func effectiveRange(_ result: MarkerResult, _ marker: MarkerDef? = nil) -> EffectiveRange {
        if result.rangeLow != nil || result.rangeHigh != nil {
            return EffectiveRange(low: result.rangeLow, high: result.rangeHigh, isStandard: false)
        }
        if let marker, marker.standardRangeLow != nil || marker.standardRangeHigh != nil {
            return EffectiveRange(low: marker.standardRangeLow, high: marker.standardRangeHigh, isStandard: true)
        }
        return EffectiveRange(low: nil, high: nil, isStandard: false)
    }

    static func markerStatus(_ result: MarkerResult, _ marker: MarkerDef? = nil) -> MarkerStatus {
        guard let value = result.value else { return .unknown }
        let range = effectiveRange(result, marker)
        if range.low == nil && range.high == nil { return .unknown }
        if let low = range.low, value < low { return .low }
        if let high = range.high, value > high { return .high }
        return .in_range
    }

    /// Latest numeric result per marker key. Same as the TS Map, but keyed by markerKey in a dictionary.
    static func latestResultByMarker(_ results: [MarkerResult]) -> [String: MarkerResult] {
        var latest: [String: MarkerResult] = [:]
        for r in results {
            if r.value == nil { continue }
            if let current = latest[r.markerKey], !(r.date > current.date) { continue }
            latest[r.markerKey] = r
        }
        return latest
    }

    /// Same as latestResultByMarker but preserves JS Map insertion order (order each key was first seen).
    static func latestResultsInOrder(_ results: [MarkerResult]) -> [(key: String, result: MarkerResult)] {
        var order: [String] = []
        var latest: [String: MarkerResult] = [:]
        for r in results {
            if r.value == nil { continue }
            if let current = latest[r.markerKey] {
                if r.date > current.date { latest[r.markerKey] = r }
            } else {
                order.append(r.markerKey)
                latest[r.markerKey] = r
            }
        }
        return order.map { (key: $0, result: latest[$0]!) }
    }

    static let manualTrackingCategories: [MarkerCategory] = [.aerobic_fitness, .body_composition, .custom]

    static func coverageByCategory(_ results: [MarkerResult], sex: Sex? = nil) -> [CategoryCoverage] {
        let latest = latestResultByMarker(results)
        return MarkerCatalog.categories
            .filter { !manualTrackingCategories.contains($0.key) }
            .map { cat in
                let markersInCategory = MarkerCatalog.all.filter {
                    $0.category == cat.key && !$0.manualOnly && appliesToSex($0, sex)
                }
                var tested = 0, inRange = 0, outOfRange = 0
                for m in markersInCategory {
                    guard let r = latest[m.key] else { continue }
                    tested += 1
                    let status = markerStatus(r, m)
                    if status == .in_range { inRange += 1 }
                    else if status == .low || status == .high { outOfRange += 1 }
                }
                return CategoryCoverage(
                    category: cat.key,
                    label: cat.label,
                    totalMarkers: markersInCategory.count,
                    testedMarkers: tested,
                    inRangeCount: inRange,
                    outOfRangeCount: outOfRange,
                    percentInRange: tested > 0 ? Int(JSFormat.round(Double(inRange) / Double(tested) * 100)) : nil
                )
            }
    }

    static func overallCoverage(_ results: [MarkerResult], sex: Sex? = nil) -> OverallCoverage {
        let byCategory = coverageByCategory(results, sex: sex)
        let totalMarkers = byCategory.reduce(0) { $0 + $1.totalMarkers }
        let testedMarkers = byCategory.reduce(0) { $0 + $1.testedMarkers }
        let inRangeCount = byCategory.reduce(0) { $0 + $1.inRangeCount }
        let outOfRangeCount = byCategory.reduce(0) { $0 + $1.outOfRangeCount }
        return OverallCoverage(
            totalMarkers: totalMarkers,
            testedMarkers: testedMarkers,
            inRangeCount: inRangeCount,
            outOfRangeCount: outOfRangeCount,
            percentInRange: testedMarkers > 0 ? Int(JSFormat.round(Double(inRangeCount) / Double(testedMarkers) * 100)) : nil
        )
    }

    /// Most recent result date across everything imported/logged, or nil with no results.
    static func lastUpdatedDate(_ results: [MarkerResult]) -> String? {
        guard let first = results.first else { return nil }
        return results.reduce(first.date) { $1.date > $0 ? $1.date : $0 }
    }
}
