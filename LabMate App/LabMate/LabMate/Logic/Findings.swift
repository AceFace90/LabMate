import Foundation

// Port of src/lib/findings.ts.

nonisolated struct FindingMarker: Sendable, Identifiable {
    var key: String
    var label: String
    var value: Double
    var unit: String
    var status: MarkerStatus   // .high or .low only
    var rangeLow: Double?
    var rangeHigh: Double?
    var rangeText: String
    var isStandard: Bool
    var id: String { key }
}

nonisolated struct Finding: Sendable, Identifiable {
    var category: MarkerCategory
    var categoryLabel: String
    var outOfRangeCount: Int
    var testedCount: Int
    var markers: [FindingMarker]
    var askYourDoctor: [String]
    var possibleNextSteps: [String]
    var id: MarkerCategory { category }
}

nonisolated enum Findings {
    /**
     * Generic, widely-known "what a doctor commonly looks at" context per category -
     * deliberately NOT specific causes, timelines or supplement doses for your results.
     * We don't have a clinical basis to tell you why your levels moved or how fast
     * they'll change, and inventing that would be worse than saying nothing. What we can
     * do is point at the well-established questions/follow-ups people in this situation
     * usually discuss with a doctor.
     */
    private static let categoryGuidance: [MarkerCategory: (askYourDoctor: [String], possibleNextSteps: [String])] = [
        .liver: (
            [
                "What could be causing these liver enzyme changes?",
                "Should I review my alcohol intake, or any medications/supplements I take?",
                "Do I need imaging (e.g. an ultrasound) or further blood tests?",
            ],
            [
                "Repeat liver function tests to confirm the trend rather than a one-off reading",
                "Hepatitis B/C serology",
                "Liver ultrasound",
            ]
        ),
        .heart_lipids: (
            [
                "What's my overall cardiovascular risk, not just this one number?",
                "Would ApoB or Lp(a) testing add anything for me if I haven't had them?",
                "Are lifestyle changes enough, or should we discuss other options?",
            ],
            [
                "Repeat the lipid profile after any lifestyle changes to see if it moved",
                "A coronary calcium score if you have other risk factors",
            ]
        ),
        .electrolytes_kidney: (
            [
                "Is this a one-off or a trend for my kidney function/electrolytes?",
                "Could hydration, medications or supplements be affecting this result?",
                "Do I need a urine test (albumin:creatinine ratio) as well?",
            ],
            ["Repeat the kidney function/electrolyte panel to confirm the trend"]
        ),
        .metabolic: (
            [
                "Does this suggest a trend toward insulin resistance or diabetes?",
                "Would a fasting insulin or oral glucose tolerance test add useful information?",
            ],
            ["Repeat HbA1c/glucose in a few months", "Discuss whether an OGTT is appropriate"]
        ),
        .iron: (
            [
                "Is this iron result something to act on, or just monitor?",
                "Could diet, blood loss or absorption explain this?",
            ],
            ["Repeat iron studies", "A coeliac screen or GI review if iron stays persistently low"]
        ),
        .hormones: (
            ["What does this mean given my age/sex and symptoms (if any)?", "Should we repeat this with a same-time-of-day sample?"],
            ["Repeat TSH with free T4/T3", "Thyroid antibodies if not already checked"]
        ),
        .nutrition: (
            ["Do I need to supplement, and if so what's a safe dose for me?", "Is a more sensitive test (e.g. active B12) worth doing?"],
            ["Discuss supplementation and dosing directly with your GP or pharmacist - not something we'll estimate here"]
        ),
        .gut_health: (
            ["Do my symptoms and this result warrant a specialist review?"],
            ["Discuss with your GP whether a gastroenterology referral is warranted"]
        ),
    ]

    /**
     * Only surfaces categories with at least one out-of-range marker - this is meant to
     * be a short "what's actually flagged" list, not a restatement of everything you've
     * ever tested normal for.
     */
    static func buildFindings(_ results: [MarkerResult]) -> [Finding] {
        let latest = HealthScore.latestResultsInOrder(results)
        var findings: [Finding] = []

        for cat in MarkerCatalog.categories {
            let markersInCategory = latest
                .map { (result: $0.result, marker: MarkerCatalog.marker($0.key)) }
                .filter { $0.marker?.category == cat.key }

            if markersInCategory.isEmpty { continue }

            var outOfRange: [FindingMarker] = []
            for (result, marker) in markersInCategory {
                let status = HealthScore.markerStatus(result, marker)
                if status != .high && status != .low { continue }
                let range = HealthScore.effectiveRange(result, marker)
                outOfRange.append(FindingMarker(
                    key: result.markerKey,
                    label: marker?.label ?? result.rawName,
                    value: result.value!,
                    unit: !result.unit.isEmpty ? result.unit : (marker?.defaultUnit ?? ""),
                    status: status,
                    rangeLow: range.low,
                    rangeHigh: range.high,
                    rangeText: !result.rangeText.isEmpty ? result.rangeText : (marker?.standardRangeText ?? ""),
                    isStandard: range.isStandard
                ))
            }

            if outOfRange.isEmpty { continue }

            let guidance = categoryGuidance[cat.key]
            findings.append(Finding(
                category: cat.key,
                categoryLabel: cat.label,
                outOfRangeCount: outOfRange.count,
                testedCount: markersInCategory.count,
                markers: outOfRange,
                askYourDoctor: guidance?.askYourDoctor ?? ["What might be causing this, and is it worth monitoring or acting on?"],
                possibleNextSteps: guidance?.possibleNextSteps ?? ["Discuss whether a repeat test is worthwhile"]
            ))
        }

        return findings.enumerated()
            .sorted { a, b in
                a.element.outOfRangeCount != b.element.outOfRangeCount
                    ? a.element.outOfRangeCount > b.element.outOfRangeCount
                    : a.offset < b.offset
            }
            .map(\.element)
    }
}
