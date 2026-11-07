import Foundation

/// Plain-English copy generated from the data. Calm, descriptive, never advice or diagnosis.
enum InsightsNarrative {
    static let emptyNarrative =
        "Import a pathology report and LabMate will show where your results sit, how much of the picture is filled in, and what is worth a conversation with your doctor."

    static func years(_ d: Double) -> String { String(format: "%.1f", abs(d)) }
    static func signedYears(_ d: Double) -> String { (d <= 0 ? "\u{2212}" : "+") + years(d) }
    static func decimal(_ d: Double) -> String { String(format: "%.1f", d) }

    private static func plural(_ n: Int, _ one: String, _ many: String) -> String { n == 1 ? one : many }

    // MARK: Hero

    static func heroHeadline(_ m: InsightsModel) -> String {
        if let bio = m.bioAge {
            if bio.delta <= -1 { return "Younger Than Your Age" }
            if bio.delta < 1 { return "In Line With Your Age" }
            if bio.delta < 3 { return "A Little Above Your Age" }
            return "Above Your Age"
        }
        guard let pct = m.overall.percentInRange else { return "Getting Started" }
        if pct >= 80 { return "Mostly In Range" }
        if pct >= 50 { return "Partly In Range" }
        return "Some Results To Review"
    }

    static func heroNarrative(_ m: InsightsModel) -> String {
        var parts: [String] = []
        if let bio = m.bioAge {
            let d = abs(bio.delta)
            if bio.delta <= -1 {
                parts.append("Your blood markers point to a biological age of about \(decimal(bio.phenoAge)), roughly \(years(d)) years younger than your calendar age of \(bio.chronologicalAge).")
            } else if bio.delta < 1 {
                parts.append("Your blood markers point to a biological age of about \(decimal(bio.phenoAge)), close to your calendar age of \(bio.chronologicalAge).")
            } else {
                parts.append("Your blood markers point to a biological age of about \(decimal(bio.phenoAge)), roughly \(years(d)) years above your calendar age of \(bio.chronologicalAge).")
            }
            parts.append("It is an estimate, and a snapshot rather than a verdict.")
        } else if m.hasBirthDate {
            parts.append("A few more results are needed before LabMate can estimate your biological age.")
        }
        if let pct = m.overall.percentInRange {
            let tested = m.overall.testedMarkers
            if m.overall.outOfRangeCount == 0 {
                parts.append("All \(tested) tested \(plural(tested, "marker sits", "markers sit")) within range.")
            } else {
                parts.append("\(pct)% of your \(tested) tested markers sit within range.")
            }
        }
        if !m.hasBirthDate {
            parts.append("Add your date of birth to see how your results compare with your age.")
        }
        return parts.joined(separator: " ")
    }

    // MARK: Biological age

    static func bioAgeNarrative(_ bio: BioAgeResult) -> String {
        var s = "This estimate uses nine routine blood markers and your age as of \(DateUtils.formatIsoDate(bio.asOfDate))."
        if bio.delta <= -1 {
            s += " It comes out about \(years(bio.delta)) years younger than your calendar age."
        } else if bio.delta < 1 {
            s += " It sits close to your calendar age."
        } else {
            s += " It comes out about \(years(bio.delta)) years above your calendar age, which can shift with short-term events like a recent illness."
        }
        s += " Treat it as illustrative, not as a medical result."
        return s
    }

    static func contributorHeadline(_ c: BioAgeContribution) -> String {
        c.contributionYears > 0 ? "\(c.label) Adds A Little To Your Estimate" : "\(c.label) Is Helping Your Estimate"
    }

    static func contributorStatus(_ c: BioAgeContribution) -> String {
        let y = years(c.contributionYears)
        return c.contributionYears > 0 ? "Adds about \(y) years" : "Takes off about \(y) years"
    }

    static func contributorNarrative(_ c: BioAgeContribution) -> String {
        let v = "\(JSFormat.number(c.value)) \(c.unit)"
        var s = "Your latest \(c.label) is \(v), against a typical range of \(c.referenceDescription)."
        s += " If this one value sat in the middle of its range, your estimate would move by about \(years(c.contributionYears)) years."
        s += " \(c.label.prefix(1).uppercased() + c.label.dropFirst()) \(c.tip)"
        return s
    }

    // MARK: Overall and categories

    static func overallNarrative(_ m: InsightsModel) -> String {
        let o = m.overall
        guard o.testedMarkers > 0 else { return "Once results are imported, this shows how many sit within their ranges." }
        var s = "\(o.inRangeCount) of \(o.testedMarkers) tested \(plural(o.testedMarkers, "marker is", "markers are")) within range"
        s += o.outOfRangeCount == 0 ? "." : ", and \(o.outOfRangeCount) \(plural(o.outOfRangeCount, "sits", "sit")) outside."
        if let d = m.lastUpdated { s += " Your most recent result is from \(DateUtils.formatIsoDate(d))." }
        return s
    }

    static func coverageNarrative(_ m: InsightsModel) -> String {
        let o = m.overall
        let pct = o.totalMarkers > 0 ? Int(Double(o.testedMarkers) / Double(o.totalMarkers) * 100) : 0
        return "You have results for \(o.testedMarkers) of \(o.totalMarkers) tracked markers, about \(pct)% of the picture. Untested areas are simply not covered yet, they are not a concern in themselves."
    }

    static func categoryNarrative(_ c: CategoryCoverage) -> String {
        if c.testedMarkers == 0 {
            return "No results here yet. Adding a test would fill in this part of the picture."
        }
        if c.outOfRangeCount == 0 {
            return "All \(c.testedMarkers) tested \(plural(c.testedMarkers, "marker sits", "markers sit")) within range."
        }
        return "\(c.outOfRangeCount) of \(c.testedMarkers) tested \(plural(c.testedMarkers, "marker sits", "markers sit")) outside range. A doctor can help put that in context."
    }

    // MARK: Findings

    static func findingsIntro(_ findings: [Finding]) -> String {
        if findings.isEmpty {
            return "Nothing is outside its range right now. That is a snapshot, and worth rechecking at your usual interval."
        }
        return "These categories have at least one result outside its range, most affected first. This is general information, not a diagnosis."
    }

    static func findingHeadline(_ f: Finding) -> String { "\(f.categoryLabel): Worth A Conversation" }

    static func findingNarrative(_ f: Finding) -> String {
        let names = f.markers.prefix(3).map(\.label)
        let list: String
        switch names.count {
        case 0: list = ""
        case 1: list = names[0]
        case 2: list = "\(names[0]) and \(names[1])"
        default: list = "\(names[0]), \(names[1]) and \(names[2])"
        }
        var s = "\(f.outOfRangeCount) of \(f.testedCount) tested \(plural(f.testedCount, "marker is", "markers are")) outside range"
        if !list.isEmpty { s += ", including \(list)" }
        s += ". A single reading is a snapshot, and many everyday things can nudge a value for a while. Your doctor can help put it in context."
        return s
    }

    static let findingCaveat =
        "LabMate does not guess at causes, timelines or doses. Those depend on your history and need a clinician."
}
