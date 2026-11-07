import Foundation

// Port of mergeResults / removeResult / updateResult / fingerprint from src/lib/storage.ts.
// (Persistence itself is not ported - the native app uses its own store.)

/// The subset of MarkerResult fields updateResult may patch. nil = leave unchanged, matching a
/// missing key in the TS Partial<...>. Use `.some(nil)` (via the double-optional fields) to clear a range bound.
nonisolated struct ResultPatch: Sendable {
    var date: String? = nil
    var value: Double?? = nil
    var displayValue: String? = nil
    var rangeLow: Double?? = nil
    var rangeHigh: Double?? = nil
    var rangeText: String? = nil
    var unit: String? = nil
}

nonisolated enum ResultMerge {
    /// Adds new results, skipping exact duplicates (same marker+date+value+source).
    static func mergeResults(_ existing: [MarkerResult], _ incoming: [MarkerResult]) -> [MarkerResult] {
        var seen = Set(existing.map(fingerprint))
        var merged = existing
        for r in incoming {
            let fp = fingerprint(r)
            if seen.contains(fp) { continue }
            seen.insert(fp)
            merged.append(r)
        }
        return merged
    }

    static func fingerprint(_ r: MarkerResult) -> String {
        "\(r.markerKey)|\(r.date)|\(r.displayValue)"
    }

    static func removeResult(_ results: [MarkerResult], id: String) -> [MarkerResult] {
        results.filter { $0.id != id }
    }

    static func updateResult(_ results: [MarkerResult], id: String, patch: ResultPatch) -> [MarkerResult] {
        results.map { r in
            guard r.id == id else { return r }
            var u = r
            if let v = patch.date { u.date = v }
            if let v = patch.value { u.value = v }
            if let v = patch.displayValue { u.displayValue = v }
            if let v = patch.rangeLow { u.rangeLow = v }
            if let v = patch.rangeHigh { u.rangeHigh = v }
            if let v = patch.rangeText { u.rangeText = v }
            if let v = patch.unit { u.unit = v }
            return u
        }
    }
}
