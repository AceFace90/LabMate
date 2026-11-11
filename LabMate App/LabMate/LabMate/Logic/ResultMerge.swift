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
    private static let operatorRx = Rx(#"[<>]"#)

    /// Same measurement: identical printed value, or the same number ("5.3" vs "5.30").
    static func sameValue(_ a: MarkerResult, _ b: MarkerResult) -> Bool {
        if JS.trim(a.displayValue) == JS.trim(b.displayValue) { return true }
        guard let av = a.value, let bv = b.value,
              !operatorRx.test(a.displayValue), !operatorRx.test(b.displayValue) else { return false }
        return abs(av - bv) < 1e-6
    }

    private static func slot(_ r: MarkerResult) -> String { "\(r.markerKey)|\(r.date)" }

    struct ImportConflict: Sendable {
        var incoming: MarkerResult
        var existing: MarkerResult
    }

    struct ImportClassification: Sendable {
        /// Nothing stored for this marker on this date.
        var added: [MarkerResult] = []
        /// Already stored with the same value - nothing to do.
        var unchanged: [MarkerResult] = []
        /// Same marker and date already stored, but with a different value.
        var conflicts: [ImportConflict] = []
    }

    /// Sorts incoming results into new, already-imported, and differs-from-what's-stored.
    static func classifyImport(_ existing: [MarkerResult], _ incoming: [MarkerResult]) -> ImportClassification {
        var bySlot: [String: [MarkerResult]] = [:]
        for r in existing { bySlot[slot(r), default: []].append(r) }
        var out = ImportClassification()
        for r in incoming {
            let stored = bySlot[slot(r)] ?? []
            if stored.contains(where: { sameValue($0, r) }) {
                out.unchanged.append(r)
            } else if let first = stored.first {
                out.conflicts.append(ImportConflict(incoming: r, existing: first))
            } else {
                out.added.append(r)
                bySlot[slot(r)] = [r] // a repeat of the same row within one report is "unchanged"
            }
        }
        return out
    }

    /// Adds new results, skipping ones already stored with the same marker, date and value.
    static func mergeResults(_ existing: [MarkerResult], _ incoming: [MarkerResult]) -> [MarkerResult] {
        var merged = existing
        for r in incoming {
            if merged.contains(where: { slot($0) == slot(r) && sameValue($0, r) }) { continue }
            merged.append(r)
        }
        return merged
    }

    /// Kept for callers that dedupe by exact marker|date|displayValue.
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
