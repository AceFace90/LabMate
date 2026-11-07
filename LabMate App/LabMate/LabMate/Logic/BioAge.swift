import Foundation

/**
 * Estimated biological age using the published PhenoAge algorithm
 * (Levine et al., 2018, "An epigenetic biomarker of aging for lifespan and
 * healthspan", Aging (Albany NY)).
 *
 * Weights and units checked against the paper's Table 1
 * (https://pmc.ncbi.nlm.nih.gov/articles/PMC5940111/); the intercept and the
 * mortality-score -> years constants against the BioAge R package's implementation
 * (https://github.com/dayoonkwon/BioAge/blob/master/R/phenoage_calc.R), as the
 * paper's supplement wasn't retrievable. Inputs are blood/serum markers - CRP in the
 * model is mg/dL (labs report mg/L, converted below). Treat this as an illustrative
 * estimate, not a clinical or diagnostic result - and don't confuse it with Everlab's
 * (or any other service's) proprietary biological-age score, which uses a different,
 * undisclosed method.
 */

nonisolated struct PhenoAgeInput: Sendable {
    let key: String
    let label: String
    let unit: String
}

nonisolated struct BioAgeContribution: Sendable, Identifiable {
    var key: String
    var label: String
    var unit: String
    var value: Double
    /// Years this marker is currently adding (positive) or subtracting (negative) vs. its own reference point, all else held equal.
    var contributionYears: Double
    var direction: Direction
    var referenceDescription: String
    var tip: String
    var id: String { key }

    enum Direction: String, Sendable { case lower, raise }
}

nonisolated struct BioAgeCappedMarker: Sendable, Identifiable {
    var key: String
    var label: String
    var unit: String
    var value: Double
    /// The range limit the value was capped at for the inflammation-adjusted what-if.
    var cappedAt: Double
    var id: String { key }
}

nonisolated struct BioAgeResult: Sendable {
    var phenoAge: Double
    var chronologicalAge: Int
    var delta: Double
    var asOfDate: String
    var usedResults: [String: MarkerResult]
    /// Markers currently pushing the estimate older, ranked by impact (largest first).
    var topContributors: [BioAgeContribution]
    /// Set when a contributor was left out of the ranking above for a documented reason (e.g. creatine supplementation), so the UI can explain the omission.
    var excludedNote: String?
    /// What the same, unmodified PhenoAge formula would output if creatinine sat at the
    /// middle of its reference range instead of your actual reading - shown alongside the
    /// real estimate (never in place of it) when you've flagged creatine supplementation
    /// and your creatinine is actually elevated, so you can see the size of that effect.
    var phenoAgeExcludingCreatinine: Double?
    /// Cystatin C-based eGFR (doesn't depend on creatinine, so creatine supplementation
    /// doesn't affect it) - shown as independent supporting evidence when you've flagged
    /// creatine supplementation and have a Cystatin C result, alongside (never instead of)
    /// the real PhenoAge estimate above.
    var cystatinCEgfr: Double?
    /// The creatinine (umol/L) your age/sex would be expected to produce at your Cystatin
    /// C-based eGFR - i.e. what creatinine would likely read if it reflected only kidney
    /// filtration, not the extra load from creatine supplementation. Derived by inverting
    /// the standard creatinine-based eGFR equation against your Cystatin-C eGFR.
    var normalisedCreatinine: Double?
    /// PhenoAge recomputed with normalisedCreatinine in place of your real creatinine
    /// reading - a creatine-adjusted biological age, shown alongside (never in place of)
    /// the real phenoAge above. Only available when you've flagged creatine supplementation
    /// and have a Cystatin C result.
    var phenoAgeCreatineAdjusted: Double?
    /// What the same, unmodified PhenoAge formula would output with any inflammation marker
    /// that's out of range in the inflammatory direction (high hs-CRP or white cell count,
    /// low lymphocyte %) capped at the edge of its normal range - shown alongside (never in
    /// place of) the real phenoAge above, only when at least one marker was capped, so a
    /// short-term spike (surgery, infection) can be told apart from a long-term trend. A
    /// what-if, not a validated model.
    var phenoAgeInflammationAdjusted: Double?
    /// The markers capped for phenoAgeInflammationAdjusted, with their real values.
    var inflammationCapped: [BioAgeCappedMarker]
}

nonisolated struct BioAgeMissing: Sendable, Identifiable {
    var key: String
    var label: String
    var id: String { key }
}

nonisolated struct BioAgeUnavailable: Sendable {
    var missing: [BioAgeMissing]
}

nonisolated enum BioAgeOutcome: Sendable {
    case available(BioAgeResult)
    case unavailable(BioAgeUnavailable)

    var result: BioAgeResult? { if case .available(let r) = self { return r } else { return nil } }
    var isAvailable: Bool { result != nil }
}

/// The slice of Profile computeBioAge reads.
nonisolated struct BioAgeProfile: Sendable {
    var takesCreatineSupplement: Bool?
    var sex: Sex?
    init(takesCreatineSupplement: Bool? = nil, sex: Sex? = nil) {
        self.takesCreatineSupplement = takesCreatineSupplement
        self.sex = sex
    }
    init(_ p: Profile) { self.init(takesCreatineSupplement: p.takesCreatineSupplement, sex: p.sex) }
}

nonisolated enum BioAge {
    static let phenoAgeInputs: [PhenoAgeInput] = [
        PhenoAgeInput(key: "albumin", label: "Albumin", unit: "g/L"),
        PhenoAgeInput(key: "creatinine", label: "Creatinine", unit: "umol/L"),
        PhenoAgeInput(key: "glucose", label: "Glucose", unit: "mmol/L"),
        PhenoAgeInput(key: "hs_crp", label: "hs-CRP", unit: "mg/L"),
        PhenoAgeInput(key: "lymphocyte_percent", label: "Lymphocyte %", unit: "%"),
        PhenoAgeInput(key: "mcv", label: "MCV", unit: "fL"),
        PhenoAgeInput(key: "rdw", label: "RDW", unit: "%"),
        PhenoAgeInput(key: "alp", label: "ALP", unit: "U/L"),
        PhenoAgeInput(key: "wcc", label: "White Cell Count", unit: "x10^9/L"),
    ]

    // Markers that swing with acute inflammation (surgery, infection) rather than long-term ageing,
    // and the direction inflammation pushes each one: CRP and white cells rise, while lymphocyte %
    // falls as neutrophils surge. Albumin also drops in acute illness, but it's equally a
    // nutrition/liver marker, so it's left as-is.
    // (Ordered array: JS iterates the object keys in this order.)
    private enum InflammationDirection { case high, low }
    private static let inflammationDirections: [(key: String, direction: InflammationDirection)] = [
        ("hs_crp", .high),
        ("wcc", .high),
        ("lymphocyte_percent", .low),
    ]

    // General, non-personalised levers commonly associated with each marker. Not medical
    // advice - directional starting points to discuss with a doctor, not a treatment plan.
    private static let improvementTips: [String: String] = [
        "albumin": "often reflects protein intake and liver/gut health.",
        "creatinine": "mostly reflects muscle mass and kidney filtration - stay well hydrated before a retest.",
        "glucose": "responds to refined carbs/alcohol intake, body composition, sleep and activity.",
        "hs_crp": "a general inflammation marker - sleep, weight, dental health, exercise and infections all move it.",
        "lymphocyte_percent": "shifts with recent infections/illness and overall immune load.",
        "mcv": "often tracks B12, folate or iron status.",
        "rdw": "often tracks B12, folate or iron status.",
        "alp": "reflects liver and bone turnover.",
        "wcc": "rises with infection, inflammation or physical stress.",
    ]

    static func phenoAgeFromInputs(_ inputs: [String: Double], chronologicalAge: Int) -> Double {
        let xb =
            -19.907 +
            -0.0336 * inputs["albumin"]! +
            0.0095 * inputs["creatinine"]! +
            0.1953 * inputs["glucose"]! +
            // The model takes ln(CRP in mg/dL); results are stored in mg/L as labs print them.
            0.0954 * log(max(inputs["hs_crp"]! / 10, 0.001)) +
            -0.012 * inputs["lymphocyte_percent"]! +
            0.0268 * inputs["mcv"]! +
            0.3306 * inputs["rdw"]! +
            0.00188 * inputs["alp"]! +
            0.0554 * inputs["wcc"]! +
            0.0804 * Double(chronologicalAge)

        let gamma = 0.0076927
        let mortalityScore = 1 - exp((-exp(xb) * (exp(gamma * 120) - 1)) / gamma)
        return 141.50225 + log(-0.0055305 * log(1 - mortalityScore)) / 0.090165
    }

    private static func referencePoint(_ range: EffectiveRange) -> Double? {
        if let low = range.low, let high = range.high { return (low + high) / 2 }
        if let high = range.high { return high }
        if let low = range.low { return low }
        return nil
    }

    static func computeBioAge(
        latestByMarker: [String: MarkerResult],
        birthDate: String,
        profile: BioAgeProfile? = nil
    ) -> BioAgeOutcome {
        // PhenoAge needs blood creatinine (umol/L). A urine creatinine (mmol/L) mis-filed
        // under this marker by an older import would otherwise swing the estimate by years.
        let creatinine = latestByMarker["creatinine"]
        let creatinineUnit = (creatinine?.unit ?? "").lowercased()
            .replacingOccurrences(of: "µ", with: "u")
            .replacingOccurrences(of: "μ", with: "u")
            .filter { !$0.isWhitespace }
        func usable(_ key: String) -> Bool {
            latestByMarker[key] != nil && (key != "creatinine" || creatinineUnit == "" || creatinineUnit == "umol/l")
        }
        let missing = phenoAgeInputs.filter { !usable($0.key) }.map { i in
            BioAgeMissing(
                key: i.key,
                label: i.key == "creatinine" && latestByMarker[i.key] != nil ? "Creatinine (blood, umol/L)" : i.label
            )
        }
        if !missing.isEmpty { return .unavailable(BioAgeUnavailable(missing: missing)) }

        var used: [String: MarkerResult] = [:]
        for input in phenoAgeInputs { used[input.key] = latestByMarker[input.key]! }

        var inputs: [String: Double] = [:]
        for i in phenoAgeInputs { inputs[i.key] = used[i.key]!.value! }

        let albumin = used["albumin"]!
        let asOfDate = phenoAgeInputs.map { used[$0.key]! }.reduce(albumin.date) { $1.date > $0 ? $1.date : $0 }
        let chronologicalAge = DateUtils.ageInYears(birthDate, asOfDate)

        let phenoAge = phenoAgeFromInputs(inputs, chronologicalAge: chronologicalAge)

        // Inflammation what-if: cap each inflammation marker that's out of range in the
        // direction inflammation pushes it at that edge of its own normal range (the lab's
        // printed range if it has one), not the middle - the smallest change that takes it out
        // of "abnormal". Everything else is left as-is, so this can only ever remove an
        // inflammation effect, never add one.
        var cappedInputs = inputs
        var inflammationCapped: [BioAgeCappedMarker] = []
        for (key, direction) in inflammationDirections {
            let range = HealthScore.effectiveRange(used[key]!, MarkerCatalog.marker(key))
            let value = inputs[key]!
            let cappedAt: Double?
            switch direction {
            case .high: cappedAt = (range.high != nil && value > range.high!) ? range.high : nil
            case .low: cappedAt = (range.low != nil && value < range.low!) ? range.low : nil
            }
            guard let cappedAt else { continue }
            cappedInputs[key] = cappedAt
            let input = phenoAgeInputs.first { $0.key == key }!
            inflammationCapped.append(BioAgeCappedMarker(key: key, label: input.label, unit: input.unit, value: value, cappedAt: cappedAt))
        }
        let phenoAgeInflammationAdjusted: Double? =
            inflammationCapped.isEmpty ? nil : phenoAgeFromInputs(cappedInputs, chronologicalAge: chronologicalAge)

        // If we have a Cystatin C result and know sex, derive a creatine-adjusted biological
        // age: Cystatin C -> eGFR (unaffected by creatine) -> invert the standard creatinine
        // eGFR equation to get the creatinine your kidneys "should" produce at that eGFR ->
        // feed that normalised creatinine into the same PhenoAge formula. Computed independent
        // of whether creatinine is actually a top contributor this time, so it's available
        // whenever the inputs support it.
        var cystatinEgfr: Double?
        var normalisedCreatinine: Double?
        var phenoAgeCreatineAdjusted: Double?
        if profile?.takesCreatineSupplement == true, let sex = profile?.sex {
            if let cystatinValue = latestByMarker["cystatin_c"]?.value {
                cystatinEgfr = KidneyFunction.cystatinCEgfr(cystatinValue, age: chronologicalAge, sex: sex)
                normalisedCreatinine = KidneyFunction.normalisedCreatinineFromCystatinC(cystatinValue, age: chronologicalAge, sex: sex)
                var adjusted = inputs
                adjusted["creatinine"] = normalisedCreatinine
                phenoAgeCreatineAdjusted = phenoAgeFromInputs(adjusted, chronologicalAge: chronologicalAge)
            }
        }

        // For each input, ask "what would my estimate be if this one marker sat at the
        // middle of its own reference range instead?" - the gap between that and the real
        // estimate is how many years that marker's current value is currently adding or
        // removing, holding everything else fixed.
        var excludedNote: String?
        var phenoAgeExcludingCreatinine: Double?
        var topContributors: [BioAgeContribution] = []
        for input in phenoAgeInputs {
            let result = used[input.key]!
            let marker = MarkerCatalog.marker(input.key)
            let range = HealthScore.effectiveRange(result, marker)
            guard let reference = referencePoint(range) else { continue }

            var counterfactualInputs = inputs
            counterfactualInputs[input.key] = reference
            let counterfactual = phenoAgeFromInputs(counterfactualInputs, chronologicalAge: chronologicalAge)
            let contributionYears = phenoAge - counterfactual
            // Only surface markers currently pushing the estimate older - moving those toward
            // the reference point is what actually helps. A marker with a negative contribution
            // is already helping (e.g. a naturally protective value), not something to "fix".
            if contributionYears < 0.05 { continue }

            // Creatine supplementation raises serum creatinine independent of kidney function
            // (it's the metabolic source of creatinine), so "lower your creatinine" is misleading
            // advice for a supplement user even though the raw PhenoAge math still uses the real
            // reading - we don't alter the formula, only which drivers we tell the user to act on.
            if input.key == "creatinine" && profile?.takesCreatineSupplement == true {
                var note = "Creatinine is excluded below - you've noted you take a creatine supplement, which raises creatinine independent of kidney function."
                phenoAgeExcludingCreatinine = counterfactual
                if let egfr = cystatinEgfr, let normCr = normalisedCreatinine {
                    note += " Your Cystatin C-based eGFR - a kidney-function estimate that doesn't depend on creatinine at all - is "
                        + "~\(String(format: "%.0f", egfr)) mL/min/1.73m² (\(egfr >= 60 ? "normal range" : "below the usual 60 cutoff, worth discussing with your doctor")), "
                        + "which corresponds to a normalised creatinine of ~\(String(format: "%.0f", normCr)) umol/L - see the creatine-adjusted biological age above."
                }
                excludedNote = note
                continue
            }

            let value = inputs[input.key]!
            let direction: BioAgeContribution.Direction = value > reference ? .lower : .raise
            let std = range.isStandard ? " (general range)" : ""
            let referenceDescription: String
            if let low = range.low, let high = range.high {
                referenceDescription = "\(JSFormat.number(low)) - \(JSFormat.number(high))\(std)"
            } else if let high = range.high {
                referenceDescription = "< \(JSFormat.number(high))\(std)"
            } else {
                referenceDescription = "> \(JSFormat.number(range.low!))\(std)"
            }

            topContributors.append(BioAgeContribution(
                key: input.key,
                label: input.label,
                unit: input.unit,
                value: value,
                contributionYears: contributionYears,
                direction: direction,
                referenceDescription: referenceDescription,
                tip: improvementTips[input.key]!
            ))
        }
        // Stable sort, largest contribution first (matches JS Array.sort stability).
        topContributors = topContributors.enumerated()
            .sorted { a, b in
                a.element.contributionYears != b.element.contributionYears
                    ? a.element.contributionYears > b.element.contributionYears
                    : a.offset < b.offset
            }
            .map(\.element)

        return .available(BioAgeResult(
            phenoAge: phenoAge,
            chronologicalAge: chronologicalAge,
            delta: phenoAge - Double(chronologicalAge),
            asOfDate: asOfDate,
            usedResults: used,
            topContributors: topContributors,
            excludedNote: excludedNote,
            phenoAgeExcludingCreatinine: phenoAgeExcludingCreatinine,
            cystatinCEgfr: cystatinEgfr,
            normalisedCreatinine: normalisedCreatinine,
            phenoAgeCreatineAdjusted: phenoAgeCreatineAdjusted,
            phenoAgeInflammationAdjusted: phenoAgeInflammationAdjusted,
            inflammationCapped: inflammationCapped
        ))
    }
}
