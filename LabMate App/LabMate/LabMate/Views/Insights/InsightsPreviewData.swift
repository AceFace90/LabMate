import Foundation

/// Sample data for #Preview blocks only.
enum InsightsPreviewData {
    private static func r(_ key: String, _ name: String, _ v: Double, _ unit: String, _ lo: Double?, _ hi: Double?) -> MarkerResult {
        MarkerResult(
            id: key, markerKey: key, rawName: name, date: "2026-10-20", value: v,
            displayValue: String(v), flag: .none, rangeLow: lo, rangeHigh: hi,
            rangeText: "", unit: unit, sourceFile: "sample.pdf", panel: "Sample",
            addedManually: false, derived: nil, createdAt: "2026-10-20T00:00:00Z"
        )
    }

    static let results: [MarkerResult] = [
        r("albumin", "Albumin", 45, "g/L", 35, 50),
        r("creatinine", "Creatinine", 82, "umol/L", 60, 110),
        r("glucose", "Glucose", 5.9, "mmol/L", 3.0, 5.4),
        r("hs_crp", "hs-CRP", 1.2, "mg/L", 0, 3),
        r("lymphocyte_percent", "Lymphocytes %", 30, "%", 20, 40),
        r("mcv", "MCV", 90, "fL", 80, 100),
        r("rdw", "RDW", 13, "%", 11.5, 14.5),
        r("alp", "ALP", 70, "U/L", 30, 110),
        r("wcc", "White cell count", 6.1, "x10^9/L", 4, 11),
        r("ldl", "LDL Cholesterol", 3.8, "mmol/L", 0, 3.5),
    ]

    static let profile = Profile(name: "Alex Sample", birthDate: "1988-04-12", sex: .M,
                                 takesCreatineSupplement: nil, theme: nil)

    static var model: InsightsModel { InsightsModel(results: results, profile: profile, nameFallback: nil) }

    static var modelWithoutBioAge: InsightsModel {
        InsightsModel(results: Array(results.prefix(4)), profile: Profile.empty, nameFallback: "Alex")
    }

    static var emptyModel: InsightsModel { InsightsModel(results: [], profile: .empty, nameFallback: "Alex") }
}
