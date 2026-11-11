import SwiftUI

// MARK: - What's Moving Your Age

struct MovingYourAgeSection: View {
    let bioAge: BioAgeResult

    var body: some View {
        VStack(alignment: .leading, spacing: 14) {
            InsightsSectionTitle(
                title: "What's Moving Your Age",
                subtitle: "Each marker is compared with where your estimate would land if that one value sat mid-range. The biggest gaps come first."
            )
            if let note = bioAge.excludedNote { InsightsCaveat(text: note) }
            ForEach(bioAge.topContributors.prefix(5)) { c in
                NavigationLink(value: InsightsRoute.contributor(c.key)) {
                    HStack(alignment: .center) {
                        VStack(alignment: .leading, spacing: 4) {
                            HealthLinkLabel(
                                title: c.label,
                                color: c.contributionYears > 0 ? HealthColor.vitals : HealthColor.good,
                                symbol: c.contributionYears > 0 ? "arrow.up.circle.fill" : "checkmark.circle.fill"
                            )
                            Text(InsightsNarrative.contributorStatus(c))
                                .font(.title3.bold()).foregroundStyle(.primary)
                            Text("\(JSFormat.number(c.value)) \(c.unit), typical \(c.referenceDescription)")
                                .font(.footnote).foregroundStyle(.secondary)
                        }
                        Spacer(minLength: 8)
                        ScoreRing(segments: [(clamp01(abs(c.contributionYears) / 3),
                                              c.contributionYears > 0 ? HealthColor.serious : HealthColor.good)],
                                  label: InsightsNarrative.years(c.contributionYears), lineWidth: 6, size: 54)
                            .chartAccessibility(InsightsNarrative.contributorStatus(c))
                    }
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .contentShape(.rect)
                }
                .buttonStyle(.plain)
            }
            InsightsCaveat(text: "General information, not personal medical advice. Talk to your doctor before changing anything based on this.")
        }
    }
}

struct ContributorDetailView: View {
    let contribution: BioAgeContribution
    var body: some View {
        HealthPage {
            Text(InsightsNarrative.contributorHeadline(contribution)).healthHeadline()
            Text(InsightsNarrative.contributorNarrative(contribution)).healthNarrative()
            HealthCard {
                HealthCardHeader(eyebrow: "Effect on estimate", title: InsightsNarrative.contributorStatus(contribution)) {
                    ScoreRing(segments: [(clamp01(abs(contribution.contributionYears) / 3),
                                          contribution.contributionYears > 0 ? HealthColor.serious : HealthColor.good)],
                              label: InsightsNarrative.signedYears(contribution.contributionYears), lineWidth: 8, size: 76)
                        .chartAccessibility(InsightsNarrative.contributorStatus(contribution))
                }
                DetailTable(rows: [
                    ("Your value", "\(JSFormat.number(contribution.value)) \(contribution.unit)"),
                    ("Typical range", contribution.referenceDescription),
                    ("Direction", contribution.direction == .lower ? "Lower is closer to range" : "Higher is closer to range"),
                ])
                InsightsCaveat(text: "General information, not personal medical advice.")
            }
        }
        .navigationTitle(contribution.label)
        .navigationBarTitleDisplayMode(.inline)
    }
}

// MARK: - Bio age card

struct BioAgeCard: View {
    let model: InsightsModel
    @Environment(AppRouter.self) private var router
    @State private var showInfo = false
    @State private var showCreatine = false

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            HealthCard {
                if let bio = model.bioAge {
                    let color = bio.delta <= 0 ? HealthColor.good : HealthColor.serious
                    HealthCardHeader(eyebrow: "Estimated biological age",
                                     title: "\(InsightsNarrative.signedYears(bio.delta)) years", titleColor: color) {
                        ScoreRing(segments: [(clamp01(0.5 + bio.delta / 20), color)],
                                  label: InsightsNarrative.decimal(bio.phenoAge), lineWidth: 9, size: 84)
                            .chartAccessibility("Biological age \(InsightsNarrative.decimal(bio.phenoAge))")
                    }
                    DetailTable(rows: detailRows(bio))
                    CardNarrative(text: InsightsNarrative.bioAgeNarrative(bio))
                } else {
                    HealthCardHeader(eyebrow: "Estimated biological age", title: "Need \(model.missingBioAge.count) More Markers") {
                        ScoreRing(segments: [], label: "\u{2013}", lineWidth: 9, size: 84)
                            .chartAccessibility("Biological age not available")
                    }
                    CardNarrative(text: "Missing: " + model.missingBioAge.map(\.label).joined(separator: ", ") + ".")
                }
                HStack(spacing: 16) {
                    infoButton("About this estimate", on: $showInfo)
                    if model.bioAge?.phenoAgeCreatineAdjusted != nil {
                        infoButton("Creatine adjustment", on: $showCreatine)
                    }
                }
                .font(.footnote)
            }

            if showInfo { InfoCard(text: Self.aboutText, link: ("Primary paper", "https://pmc.ncbi.nlm.nih.gov/articles/PMC5940111/")) }
            if model.profile.takesCreatineSupplement == true && model.profile.sex == nil {
                InfoCard(text: "Set your sex in Settings to enable the Cystatin C based adjustment. The eGFR equations differ by sex.",
                         tint: HealthColor.serious)
            }
            if showCreatine, let bio = model.bioAge, bio.phenoAgeCreatineAdjusted != nil {
                InfoCard(text: Self.creatineText(bio),
                         link: ("kidney.org published coefficients", "https://www.kidney.org/professionals/gfr_calculator"))
            }
            if !showCreatine, let bio = model.bioAge,
               bio.phenoAgeCreatineAdjusted == nil, let alt = bio.phenoAgeExcludingCreatinine {
                InfoCard(text: "The headline number uses your real creatinine reading, on purpose, because the published formula was validated against it. For reference only: if creatinine sat mid-range, the same formula would give \(InsightsNarrative.decimal(alt)), about \(InsightsNarrative.years(bio.phenoAge - alt)) years lower. A Cystatin C result would allow a better grounded adjustment; see the Test Plan tab.")
            }
        }
    }

    private func detailRows(_ bio: BioAgeResult) -> [(String, String)] {
        var rows: [(String, String)] = [
            ("Biological age", InsightsNarrative.decimal(bio.phenoAge)),
            ("Calendar age", "\(bio.chronologicalAge)"),
            ("As of", DateUtils.formatIsoDate(bio.asOfDate)),
        ]
        if let c = bio.phenoAgeCreatineAdjusted {
            rows.append(("Creatine-adjusted", InsightsNarrative.decimal(c)))
        }
        return rows
    }

    private func infoButton(_ title: String, on binding: Binding<Bool>) -> some View {
        Button { withAnimation { binding.wrappedValue.toggle() } } label: {
            Label(title, systemImage: binding.wrappedValue ? "info.circle.fill" : "info.circle")
        }
        .accessibilityHint(binding.wrappedValue ? "Hides the explanation" : "Shows an explanation")
    }

    static let aboutText = "PhenoAge (Levine et al., 2018, published in Aging) was derived from about 9,900 adults in the NHANES III cohort and validated against 10-year all-cause mortality. It estimates biological age from nine routine blood markers (albumin, creatinine, glucose, hs-CRP, lymphocyte %, MCV, RDW, ALP, white cell count) plus your chronological age. Coefficients are checked against the paper and the BioAge R package. Treat the result as illustrative, not diagnostic or medical advice."

    static func creatineText(_ bio: BioAgeResult) -> String {
        let egfr = bio.cystatinCEgfr.map { String(format: "%.0f", $0) } ?? "?"
        let norm = bio.normalisedCreatinine.map { String(format: "%.0f", $0) } ?? "?"
        let tail = (bio.cystatinCEgfr ?? 90) < 60 ? ", below the usual 60 cutoff, which is worth discussing with your doctor" : ", in the normal range"
        return "Your Cystatin C result gives an eGFR that does not depend on creatinine (about \(egfr) mL/min/1.73m\u{00B2}\(tail)). LabMate inverts the standard creatinine-based eGFR equation to find the creatinine your age and sex would be expected to produce at that same filtration rate (about \(norm) umol/L), and uses it in the same PhenoAge formula. The headline number keeps your real reading. Both eGFR equations (CKD-EPI 2012 Cystatin C, CKD-EPI 2021 creatinine) are checked against published coefficients, but PhenoAge itself is only illustrative."
    }
}

struct InfoCard: View {
    let text: String
    var link: (String, String)? = nil
    var tint: Color = .secondary
    var body: some View {
        HealthCard {
            Text(text).font(.footnote).foregroundStyle(tint).fixedSize(horizontal: false, vertical: true)
            if let link, let url = URL(string: link.1) {
                Link(link.0, destination: url).font(.footnote)
            }
        }
    }
}

// MARK: - Overall card

struct OverallCard: View {
    let model: InsightsModel
    @Environment(AppRouter.self) private var router

    var body: some View {
        let o = model.overall
        let tested = Double(max(o.testedMarkers, 1))
        let color = o.outOfRangeCount > 0 ? HealthColor.serious : HealthColor.good
        VStack(alignment: .leading, spacing: 14) {
            InsightsSectionTitle(title: "Overview")
            HealthCard {
                HealthCardHeader(
                    eyebrow: "In range, of tested",
                    title: o.outOfRangeCount == 0 && o.testedMarkers > 0 ? "All In Range" : (o.percentInRange.map { "\($0)% In Range" } ?? "No Results"),
                    titleColor: o.testedMarkers > 0 ? color : .primary
                ) {
                    ScoreRing(segments: [(Double(o.inRangeCount) / tested, HealthColor.good),
                                         (Double(o.outOfRangeCount) / tested, HealthColor.serious)],
                              label: o.percentInRange.map { "\($0)%" } ?? "\u{2013}", lineWidth: 10, size: 90)
                        .chartAccessibility("\(o.percentInRange.map { "\($0) percent" } ?? "No") of tested markers in range")
                }
                DetailTable(rows: [
                    ("In range", "\(o.inRangeCount)"),
                    ("Outside range", "\(o.outOfRangeCount)"),
                    ("Markers with data", "\(o.testedMarkers) of \(o.totalMarkers)"),
                    ("Last result", model.lastUpdated.map(DateUtils.formatIsoDate) ?? "None yet"),
                ])
                CardNarrative(text: InsightsNarrative.overallNarrative(model))
                Button { router.goToMarkers() } label: { HealthLinkLabel(title: "View all markers", symbol: "list.bullet") }
                    .buttonStyle(.plain)
            }
        }
    }
}

// MARK: - Categories

struct CategoriesSection: View {
    let model: InsightsModel
    @Environment(AppRouter.self) private var router

    var body: some View {
        VStack(alignment: .leading, spacing: 14) {
            InsightsSectionTitle(title: "Coverage By Category", subtitle: InsightsNarrative.coverageNarrative(model))
            ForEach(model.categories) { c in
                Button { router.goToMarkers(c.category) } label: {
                    HealthCard {
                        HealthCardHeader(eyebrow: c.label, title: statusLine(c)) {
                            ScoreRing(
                                segments: ringSegments(c),
                                label: c.percentInRange.map { "\($0)%" } ?? "\u{2013}", lineWidth: 8, size: 72)
                                .chartAccessibility("\(c.label): \(c.testedMarkers) of \(c.totalMarkers) tested, \(c.percentInRange.map { "\($0) percent in range" } ?? "no results")")
                        }
                        DetailTable(rows: [
                            ("Tested", "\(c.testedMarkers) of \(c.totalMarkers)"),
                            ("In range", "\(c.inRangeCount)"),
                            ("Outside range", "\(c.outOfRangeCount)"),
                        ])
                        CardNarrative(text: InsightsNarrative.categoryNarrative(c))
                        HealthLinkLabel(title: "View in Markers", color: HealthColor.category(c.category), symbol: HealthColor.categorySymbol(c.category))
                    }
                }
                .buttonStyle(.plain)
            }
        }
    }

    private func statusLine(_ c: CategoryCoverage) -> String {
        if c.testedMarkers == 0 { return "Not Tested Yet" }
        return c.outOfRangeCount == 0 ? "All In Range" : "\(c.outOfRangeCount) Outside Range"
    }

    private func ringSegments(_ c: CategoryCoverage) -> [(Double, Color)] {
        let t = Double(max(c.testedMarkers, 1))
        let base = HealthColor.category(c.category)
        guard c.testedMarkers > 0 else { return [] }
        return [(Double(c.inRangeCount) / t, base), (Double(c.outOfRangeCount) / t, HealthColor.serious)]
    }
}

// MARK: - Findings

struct FindingsSection: View {
    let model: InsightsModel
    var body: some View {
        VStack(alignment: .leading, spacing: 14) {
            InsightsSectionTitle(title: "Findings", subtitle: InsightsNarrative.findingsIntro(model.findings))
            ForEach(model.findings) { f in
                NavigationLink(value: InsightsRoute.finding(f.category)) {
                    HealthCard {
                        HealthCardHeader(eyebrow: f.categoryLabel, title: "\(f.outOfRangeCount) Of \(f.testedCount) Outside Range") {
                            ScoreRing(segments: [(Double(f.testedCount - f.outOfRangeCount) / Double(max(f.testedCount, 1)), HealthColor.good),
                                                 (Double(f.outOfRangeCount) / Double(max(f.testedCount, 1)), HealthColor.serious)],
                                      label: "\(f.outOfRangeCount)", lineWidth: 8, size: 64)
                                .chartAccessibility("\(f.outOfRangeCount) of \(f.testedCount) outside range in \(f.categoryLabel)")
                        }
                        CardNarrative(text: InsightsNarrative.findingNarrative(f))
                        HealthLinkLabel(title: "See details", symbol: "list.clipboard.fill")
                    }
                }
                .buttonStyle(.plain)
            }
            InsightsCaveat(text: InsightsNarrative.findingCaveat)
        }
    }
}

struct FindingDetailView: View {
    let finding: Finding
    @Environment(AppRouter.self) private var router

    var body: some View {
        HealthPage {
            Text(InsightsNarrative.findingHeadline(finding)).healthHeadline()
            Text(InsightsNarrative.findingNarrative(finding)).healthNarrative()

            HealthCard {
                HealthCardHeader(eyebrow: "Outside range", title: finding.categoryLabel)
                ForEach(Array(finding.markers.enumerated()), id: \.element.id) { i, m in
                    if i > 0 { Divider() }
                    VStack(alignment: .leading, spacing: 6) {
                        HStack {
                            Text(m.label).font(.headline)
                            Spacer()
                            Text("\(JSFormat.number(m.value)) \(m.unit)").font(.headline)
                        }
                        Text("\(m.status == .high ? "Above" : "Below") \(m.rangeText.isEmpty ? rangeFallback(m) : m.rangeText)\(m.isStandard ? ", general range" : "")")
                            .font(.footnote).foregroundStyle(.secondary)
                        RangeBar(value: m.value, low: m.rangeLow, high: m.rangeHigh)
                    }
                    .accessibilityElement(children: .combine)
                }
            }
            bulletCard("Questions To Consider Asking", finding.askYourDoctor)
            bulletCard("Possible Next Steps", finding.possibleNextSteps)
            InsightsCaveat(text: InsightsNarrative.findingCaveat)
            Button { router.goToMarkers(finding.category) } label: {
                HealthLinkLabel(title: "View in Markers", symbol: "list.bullet")
            }
        }
        .navigationTitle(finding.categoryLabel)
        .navigationBarTitleDisplayMode(.inline)
    }

    private func rangeFallback(_ m: FindingMarker) -> String {
        "\(m.rangeLow.map(JSFormat.number) ?? "") - \(m.rangeHigh.map(JSFormat.number) ?? "")"
    }

    private func bulletCard(_ title: String, _ items: [String]) -> some View {
        HealthCard {
            Text(title).font(.title3.weight(.semibold))
            ForEach(items, id: \.self) { item in
                HStack(alignment: .firstTextBaseline, spacing: 8) {
                    Text("\u{2022}").foregroundStyle(.secondary)
                    Text(item).font(.callout).foregroundStyle(.secondary)
                }
            }
        }
    }
}
