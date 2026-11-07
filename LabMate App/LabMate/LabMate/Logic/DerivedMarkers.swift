import Foundation

// Port of src/lib/derivedMarkers.ts.

nonisolated enum DerivedMarkers {
    /**
     * Lymphocytes % = (Absolute Lymphocyte Count / Total White Cell Count) x 100.
     * When a date has WCC plus exactly one of {Lymphocytes (absolute), Lymphocytes %},
     * fill in the missing one automatically rather than leaving it untested.
     */
    static func deriveComputedMarkers(_ results: [MarkerResult]) -> [MarkerResult] {
        var dateOrder: [String] = []
        var byDate: [String: [MarkerResult]] = [:]
        for r in results {
            if r.value == nil { continue }
            if byDate[r.date] == nil { dateOrder.append(r.date) }
            byDate[r.date, default: []].append(r)
        }

        var derived: [MarkerResult] = []
        for date in dateOrder {
            let rows = byDate[date]!
            let wcc = rows.first { $0.markerKey == "wcc" }
            let lymphAbs = rows.first { $0.markerKey == "lymphocytes" }
            let lymphPct = rows.first { $0.markerKey == "lymphocyte_percent" }
            // Presence flags avoid MarkerResult's main-actor Equatable (`== nil`) in nonisolated code.
            let hasLymphAbs = lymphAbs != nil ? true : false
            let hasLymphPct = lymphPct != nil ? true : false
            guard let wcc, let wccValue = wcc.value else { continue }

            if let lymphAbs, let absValue = lymphAbs.value, !hasLymphPct {
                let pct = (absValue / wccValue) * 100
                derived.append(makeDerived("lymphocyte_percent", "Lymphocytes %", date, pct, "%", lymphAbs))
            } else if let lymphPct, let pctValue = lymphPct.value, !hasLymphAbs {
                let abs = (pctValue / 100) * wccValue
                derived.append(makeDerived("lymphocytes", "Lymphocytes", date, abs, "x10^9/L", lymphPct))
            }
        }
        return derived
    }

    private static func makeDerived(
        _ markerKey: String,
        _ rawName: String,
        _ date: String,
        _ value: Double,
        _ unit: String,
        _ source: MarkerResult
    ) -> MarkerResult {
        let rounded = JSFormat.round(value * 100) / 100
        return MarkerResult(
            id: UUID().uuidString.lowercased(),
            markerKey: markerKey,
            rawName: rawName,
            date: date,
            value: rounded,
            displayValue: JSFormat.number(rounded),
            flag: .none,
            rangeLow: nil,
            rangeHigh: nil,
            rangeText: "",
            unit: unit,
            sourceFile: source.sourceFile,
            panel: source.panel,
            addedManually: false,
            derived: true,
            createdAt: ISO8601DateFormatter().string(from: Date())
        )
    }
}
