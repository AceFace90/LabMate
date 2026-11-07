import Foundation
import HealthKit

/// Apple Health bridge: reads fitness/body metrics into MarkerResults and writes
/// matching LabMate results back. Authorisation is requested lazily on first use.
@MainActor
final class HealthKitService {
    static let sourceName = "Apple Health"

    /// One row per supported HealthKit quantity. `markerKey` is a built-in catalog key where one
    /// exists (vo2_max, body_fat_percent, lean_mass); otherwise a `custom_*` key (same slug rule
    /// as the web app's custom markers) and AppStore registers the CustomMarker automatically.
    struct Mapping {
        let id: HKQuantityTypeIdentifier
        let markerKey: String
        let label: String          // used for rawName / custom marker label
        let unit: String           // catalog (or custom marker) unit string
        let hkUnit: HKUnit
        let scale: Double          // multiply HK value by this to get `unit`
        let decimals: Int
        let isCustom: Bool
    }

    static let mappings: [Mapping] = {
        func m(_ id: HKQuantityTypeIdentifier, _ key: String, _ label: String, _ unit: String, _ hk: HKUnit,
               scale: Double = 1, decimals: Int = 1) -> Mapping {
            Mapping(id: id, markerKey: key, label: label, unit: unit, hkUnit: hk, scale: scale, decimals: decimals,
                    isCustom: MarkerCatalog.marker(key) == nil)
        }
        let kg = HKUnit.gramUnit(with: .kilo)
        // Only metrics LabMate actually uses (Test Plan: VO2 max, DEXA body composition) are
        // read; everything else stays in Apple Health instead of bloating the synced results.
        return [
            m(.vo2Max, "vo2_max", "VO2 Max", MarkerCatalog.marker("vo2_max")?.defaultUnit ?? "mL/kg/min",
              HKUnit(from: "mL/(kg*min)")),
            m(.bodyFatPercentage, "body_fat_percent", "Body Fat %", MarkerCatalog.marker("body_fat_percent")?.defaultUnit ?? "%",
              .percent(), scale: 100),
            m(.leanBodyMass, "lean_mass", "Lean Mass", MarkerCatalog.marker("lean_mass")?.defaultUnit ?? "kg", kg),
            // Write-only: blood glucose (mmol/L, matching catalog default).
            m(.bloodGlucose, "glucose", "Glucose", MarkerCatalog.marker("glucose")?.defaultUnit ?? "mmol/L",
              HKUnit.moleUnit(with: .milli, molarMass: HKUnitMolarMassBloodGlucose).unitDivided(by: .liter()), decimals: 1),
        ]
    }()

    /// Types we read as results (glucose is write-only).
    private static var readMappings: [Mapping] { mappings.filter { $0.id != .bloodGlucose } }

    private let store = HKHealthStore()
    var isAvailable: Bool { HKHealthStore.isHealthDataAvailable() }
    private var authorised = false

    private func quantityType(_ id: HKQuantityTypeIdentifier) -> HKQuantityType { HKQuantityType(id) }

    /// Requests read+write access once per launch. Safe to call repeatedly.
    func ensureAuthorisation() async throws {
        guard isAvailable else { return }
        if authorised { return }
        let share = Set(Self.mappings.map { quantityType($0.id) as HKSampleType })
        var read = Set(Self.readMappings.map { quantityType($0.id) as HKObjectType })
        read.insert(HKCharacteristicType(.dateOfBirth))
        read.insert(HKCharacteristicType(.biologicalSex))
        try await store.requestAuthorization(toShare: share, read: read)
        authorised = true
    }

    // MARK: Read

    private static let localDay: DateFormatter = {
        let f = DateFormatter()
        f.locale = Locale(identifier: "en_US_POSIX")
        f.calendar = Calendar(identifier: .gregorian)
        f.timeZone = .current
        f.dateFormat = "yyyy-MM-dd"
        return f
    }()

    /// Reads only the most recent reading of each supported type. LabMate just needs "when was
    /// this last measured and what was it" (Test Plan cadence, latest value) - the full history
    /// stays in Apple Health instead of being copied into the synced results.
    /// IDs are `hk-<markerKey>` (one per metric) so each sync replaces the previous latest value.
    func fetchLatestResults() async throws -> [MarkerResult] {
        guard isAvailable else { return [] }
        try await ensureAuthorisation()
        var out: [MarkerResult] = []
        let now = MarkerResult.nowTimestamp()
        for map in Self.readMappings {
            // Skip samples LabMate wrote itself so they don't echo back.
            let notOurs = NSCompoundPredicate(notPredicateWithSubpredicate:
                HKQuery.predicateForObjects(withMetadataKey: HKMetadataKeyExternalUUID))
            let descriptor = HKSampleQueryDescriptor(
                predicates: [.quantitySample(type: quantityType(map.id), predicate: notOurs)],
                sortDescriptors: [SortDescriptor(\.startDate, order: .reverse)],
                limit: 1)
            guard let s = (try? await descriptor.result(for: store))?.first else { continue } // none, or denied
            let p = pow(10.0, Double(map.decimals))
            let value = (s.quantity.doubleValue(for: map.hkUnit) * map.scale * p).rounded() / p
            out.append(MarkerResult(
                id: "hk-\(map.markerKey)", markerKey: map.markerKey, rawName: map.label,
                date: Self.localDay.string(from: s.startDate),
                value: value, displayValue: Self.format(value, decimals: map.decimals), flag: .none,
                rangeLow: nil, rangeHigh: nil, rangeText: "", unit: map.unit,
                sourceFile: Self.sourceName, panel: Self.sourceName, addedManually: false, derived: nil, createdAt: now))
        }
        return out
    }

    private static func format(_ v: Double, decimals: Int) -> String { String(format: "%.\(decimals)f", v) }

    /// DOB (ISO) and sex for prefilling Profile. Nil where unavailable/denied.
    func profileDefaults() async -> (birthDate: String?, sex: Sex?) {
        guard isAvailable else { return (nil, nil) }
        try? await ensureAuthorisation()
        var dob: String?
        if let c = try? store.dateOfBirthComponents(), let y = c.year, let mo = c.month, let d = c.day {
            dob = String(format: "%04d-%02d-%02d", y, mo, d)
        }
        var sex: Sex?
        if let s = try? store.biologicalSex().biologicalSex {
            sex = s == .male ? .M : (s == .female ? .F : nil)
        }
        return (dob, sex)
    }

    // MARK: Write

    /// Writes results that have a direct HKQuantityType to Health (skips Apple Health-sourced,
    /// valueless or unit-incompatible rows, and anything already written with the same external UUID).
    /// Returns the number of samples saved.
    @discardableResult
    func write(_ results: [MarkerResult]) async throws -> Int {
        guard isAvailable else { return 0 }
        let candidates = results.filter { $0.sourceFile != Self.sourceName && $0.value != nil && Self.mapping(for: $0.markerKey) != nil }
        guard !candidates.isEmpty else { return 0 }
        try await ensureAuthorisation()

        var existing: [HKQuantityTypeIdentifier: Set<String>] = [:]
        var samples: [HKQuantitySample] = []
        for r in candidates {
            guard let map = Self.mapping(for: r.markerKey), let raw = r.value,
                  let value = Self.convert(raw, unit: r.unit, to: map),
                  let day = Self.localDay.date(from: r.date) else { continue }
            let type = quantityType(map.id)
            if existing[map.id] == nil {
                let d = HKSampleQueryDescriptor(
                    predicates: [.quantitySample(type: type, predicate: HKQuery.predicateForObjects(withMetadataKey: HKMetadataKeyExternalUUID))],
                    sortDescriptors: [], limit: nil)
                let found = (try? await d.result(for: store)) ?? []
                existing[map.id] = Set(found.compactMap { $0.metadata?[HKMetadataKeyExternalUUID] as? String })
            }
            if existing[map.id]?.contains(r.id) == true { continue }
            let noon = Calendar.current.date(bySettingHour: 12, minute: 0, second: 0, of: day) ?? day
            let hkValue = value / map.scale
            let q = HKQuantity(unit: map.hkUnit, doubleValue: hkValue)
            samples.append(HKQuantitySample(type: type, quantity: q, start: noon, end: noon,
                                            metadata: [HKMetadataKeyExternalUUID: r.id]))
        }
        guard !samples.isEmpty else { return 0 }
        try await store.save(samples)
        return samples.count
    }

    private static func mapping(for markerKey: String) -> Mapping? { mappings.first { $0.markerKey == markerKey } }

    /// Converts the result's value into the mapping's catalog unit; nil if the unit is unrecognised.
    private static func convert(_ v: Double, unit: String, to map: Mapping) -> Double? {
        let u = unit.lowercased().replacingOccurrences(of: " ", with: "")
        if u.isEmpty || u == map.unit.lowercased().replacingOccurrences(of: " ", with: "") { return v }
        switch (map.id, u) {
        case (.bloodGlucose, "mg/dl"): return v / 18.0182
        case (.bodyMass, "lb"), (.bodyMass, "lbs"), (.leanBodyMass, "lb"), (.leanBodyMass, "lbs"): return v * 0.45359237
        case (.bodyMass, "g"), (.leanBodyMass, "g"): return v / 1000
        case (.bodyFatPercentage, "%"): return v
        default: return nil
        }
    }
}
