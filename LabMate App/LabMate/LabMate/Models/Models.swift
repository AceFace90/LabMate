import Foundation

// Swift mirror of src/types.ts. Field names and JSON shape are kept identical so
// documents round-trip with the web app through Firestore (users/{uid}/results etc).

nonisolated enum MarkerCategory: String, Codable, CaseIterable, Sendable {
    case electrolytes_kidney, liver, iron, metabolic, heart_lipids, blood_marrow,
         hormones, nutrition, gut_health, autoimmunity, cancer_screening, muscle,
         aerobic_fitness, body_composition, custom
}

nonisolated enum Sex: String, Codable, Sendable { case M, F }

nonisolated struct CategoryDef: Identifiable, Sendable {
    let key: MarkerCategory
    let label: String
    let description: String
    var id: MarkerCategory { key }
}

nonisolated struct MarkerDef: Identifiable, Sendable {
    let key: String
    let label: String
    let category: MarkerCategory
    /// Fallback unit shown when a result doesn't carry its own parsed unit.
    var defaultUnit: String? = nil
    /// Lowercase names/synonyms this marker may appear as in a report. First match wins.
    let aliases: [String]
    let description: String
    /// No PDF source - logged by hand only (or via HealthKit).
    var manualOnly: Bool = false
    var sexSpecific: Sex? = nil
    /// General adult range, used only when a result carries no printed range. Not medical advice.
    var standardRangeLow: Double? = nil
    var standardRangeHigh: Double? = nil
    var standardRangeText: String? = nil
    var id: String { key }
}

nonisolated enum ResultFlag: String, Codable, Sendable {
    case none = "", high1 = "*", high2 = "**"
}

nonisolated struct MarkerResult: Codable, Identifiable, Hashable, Sendable {
    var id: String
    var markerKey: String
    var rawName: String
    /// ISO yyyy-mm-dd
    var date: String
    var value: Double?
    /// Original text as printed, e.g. "< 0.1", "Not Detected"
    var displayValue: String
    var flag: ResultFlag
    var rangeLow: Double?
    var rangeHigh: Double?
    var rangeText: String
    var unit: String
    var sourceFile: String
    var panel: String
    var addedManually: Bool
    /// Computed from other results (e.g. Lymphocytes % from Lymphocytes/WCC).
    var derived: Bool?
    var createdAt: String
}

nonisolated enum ThemePreference: String, Codable, CaseIterable, Sendable { case light, dark, auto }

nonisolated struct Profile: Codable, Equatable, Sendable {
    var name: String?
    var birthDate: String?
    var sex: Sex?
    /// Creatine raises serum creatinine independent of kidney function.
    var takesCreatineSupplement: Bool?
    var theme: ThemePreference?

    static let empty = Profile(name: nil, birthDate: nil, sex: nil, takesCreatineSupplement: nil, theme: nil)
}

/// A user-defined metric outside the built-in catalog.
nonisolated struct CustomMarker: Codable, Identifiable, Hashable, Sendable {
    var key: String
    var label: String
    var unit: String
    var createdAt: String
    var id: String { key }
}

nonisolated extension MarkerResult {
    static func newID() -> String { UUID().uuidString.lowercased() }
    static func nowTimestamp() -> String { ISO8601DateFormatter().string(from: Date()) }
}
