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

    /// App-wide switches set from the profile (see AppStore), so every chart, finding and status reads the same range.
    nonisolated(unsafe) static var useLabRanges = false
    nonisolated(unsafe) static var rangeBirthDate: String? = nil
    nonisolated(unsafe) static var rangeSex: Sex? = nil

    /// VO2 max reference standards, mL/kg/min, by age band (20-29 ... 70-79) and sex. Supplied by the user.
    /// Rows: Superior (95th), Excellent (80th), Good (60th), Fair (40th). Below Fair is rated Poor, and the
    /// Fair value is the lower bound of the range. Keep in sync with VO2_STANDARDS in src/lib/vo2Norms.ts.
    private static let vo2Fair: [Sex: [Double]] = [
        .M: [41.7, 40.5, 38.5, 35.6, 32.3, 29.4],
        .F: [36.1, 34.4, 33.0, 30.1, 27.5, 25.9],
    ]
    private static let vo2Good: [Sex: [Double]] = [
        .M: [45.4, 44.0, 42.4, 39.2, 35.5, 32.3],
        .F: [39.5, 37.8, 36.3, 33.0, 30.0, 28.1],
    ]
    private static let vo2Excellent: [Sex: [Double]] = [
        .M: [51.1, 48.3, 46.4, 43.4, 39.5, 36.7],
        .F: [43.9, 42.4, 39.7, 36.7, 33.0, 30.9],
    ]
    private static let vo2Superior: [Sex: [Double]] = [
        .M: [55.4, 54.0, 52.5, 48.9, 45.7, 42.1],
        .F: [49.6, 47.4, 45.3, 41.1, 37.8, 36.7],
    ]

    /// Body fat % in-range zone by sex (American Council on Exercise: Athletes through Acceptable;
    /// below is essential fat, above is obese). Keep in sync with bodyFatBounds in src/lib/vo2Norms.ts.
    private static func bodyFatBounds(_ sex: Sex) -> (low: Double, high: Double) {
        sex == .F ? (14, 31) : (6, 25)
    }

    /**
     * The range a result is judged against. By default the marker's built-in standard range wins,
     * so a lab's population interval (e.g. a PSA "0.25-2.1") doesn't flag a good result. With "use lab
     * ranges" on, the printed range wins instead. Either way the other is the fallback.
     * One-sided markers (PSA, CRP, LDL lower is better; HDL, eGFR higher is better) drop the bound
     * that doesn't matter, so they can never read low or high the wrong way.
     */
    static func effectiveRange(_ result: MarkerResult, _ marker: MarkerDef? = nil) -> EffectiveRange {
        let hasLab = result.rangeLow != nil || result.rangeHigh != nil
        let hasStandard = marker.map { $0.standardRangeLow != nil || $0.standardRangeHigh != nil } ?? false
        if marker?.key == "vo2_max", let birth = rangeBirthDate, let sex = rangeSex, !(useLabRanges && hasLab),
           let table = vo2Fair[sex] {
            let band = min(5, max(0, DateUtils.ageInYears(birth, result.date) / 10 - 2))
            return EffectiveRange(low: table[band], high: nil, isStandard: true)
        }
        if marker?.key == "body_fat_percent", let sex = rangeSex, !(useLabRanges && hasLab) {
            let b = bodyFatBounds(sex)
            return EffectiveRange(low: b.low, high: b.high, isStandard: true)
        }
        let preferLab = useLabRanges ? hasLab : (!hasStandard && hasLab)
        var range: EffectiveRange
        if preferLab {
            range = EffectiveRange(low: result.rangeLow, high: result.rangeHigh, isStandard: false)
        } else if hasStandard, let marker {
            range = EffectiveRange(low: marker.standardRangeLow, high: marker.standardRangeHigh, isStandard: true)
        } else {
            range = EffectiveRange(low: nil, high: nil, isStandard: false)
        }
        if marker?.direction == .lowerBetter { range.low = nil }
        else if marker?.direction == .higherBetter { range.high = nil }
        return range
    }

    /// Whether to show the lab's own flag. One-sided markers follow our directional status instead,
    /// since labs flag the harmless side too.
    static func showLabFlag(_ result: MarkerResult, _ marker: MarkerDef?) -> Bool {
        if result.flag == .none { return false }
        if marker?.direction != nil { return markerStatus(result, marker) != .in_range }
        return true
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
