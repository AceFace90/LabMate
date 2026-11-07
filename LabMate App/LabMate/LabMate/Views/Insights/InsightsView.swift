import SwiftUI

/// Everything the Insights tab needs, computed once from the store's results + profile.
struct InsightsModel {
    let results: [MarkerResult]
    let profile: Profile
    let firstName: String
    let overall: OverallCoverage
    let categories: [CategoryCoverage]
    let lastUpdated: String?
    let outcome: BioAgeOutcome?
    let findings: [Finding]

    init(results: [MarkerResult], profile: Profile, nameFallback: String?) {
        self.results = results
        self.profile = profile
        self.firstName = Greeting.firstNameOf(profile.name, fallback: nameFallback)
        self.overall = HealthScore.overallCoverage(results, sex: profile.sex)
        self.categories = HealthScore.coverageByCategory(results, sex: profile.sex)
        self.lastUpdated = HealthScore.lastUpdatedDate(results)
        self.findings = Findings.buildFindings(results)
        if let birth = profile.birthDate, !birth.isEmpty {
            self.outcome = BioAge.computeBioAge(
                latestByMarker: HealthScore.latestResultByMarker(results),
                birthDate: birth,
                profile: BioAgeProfile(profile)
            )
        } else {
            self.outcome = nil
        }
    }

    var bioAge: BioAgeResult? { outcome?.result }
    var hasBirthDate: Bool { outcome != nil }
    var missingBioAge: [BioAgeMissing] {
        if case .unavailable(let u)? = outcome { return u.missing }
        return []
    }
}

enum InsightsRoute: Hashable {
    case contributor(String)
    case finding(MarkerCategory)
}

enum InsightsSection: String, Hashable {
    case hero, bioAge, inRange, coverage, findings
}

/// Insights tab: a port of the web Dashboard in the grammar of the Health app's Insights tab.
struct InsightsView: View {
    @Environment(AppStore.self) private var store

    var body: some View {
        InsightsContent(
            model: InsightsModel(
                results: store.allResults,
                profile: store.profile,
                nameFallback: store.user?.displayName
            ),
            photoURL: store.user?.photoURL
        )
    }
}

struct InsightsContent: View {
    @Environment(AppRouter.self) private var router
    let model: InsightsModel
    var photoURL: URL? = nil
    @State private var selectedChip: InsightsSection?

    var body: some View {
        NavigationStack {
            ScrollViewReader { proxy in
                HealthPage {
                    if model.results.isEmpty {
                        InsightsEmptyState(model: model)
                    } else {
                        InsightsChipStrip(model: model, selected: selectedChip) { section in
                            selectedChip = section
                            withAnimation(.easeInOut) { proxy.scrollTo(section, anchor: .top) }
                        }
                        .padding(.horizontal, -HealthMetrics.pagePadding)

                        InsightsHero(model: model).id(InsightsSection.hero)

                        if !model.hasBirthDate {
                            BirthDatePromptCard()
                        }

                        if let bio = model.bioAge, !bio.topContributors.isEmpty || bio.excludedNote != nil {
                            MovingYourAgeSection(bioAge: bio)
                        }

                        if model.hasBirthDate {
                            BioAgeCard(model: model).id(InsightsSection.bioAge)
                        }

                        OverallCard(model: model).id(InsightsSection.inRange)

                        CategoriesSection(model: model).id(InsightsSection.coverage)

                        FindingsSection(model: model).id(InsightsSection.findings)
                    }
                }
            }
            .navigationTitle("Insights")
            .navigationBarTitleDisplayMode(.large)
            .navigationDestination(for: InsightsRoute.self) { route in
                switch route {
                case .contributor(let key):
                    if let c = model.bioAge?.topContributors.first(where: { $0.key == key }) {
                        ContributorDetailView(contribution: c)
                    }
                case .finding(let category):
                    if let f = model.findings.first(where: { $0.category == category }) {
                        FindingDetailView(finding: f)
                    }
                }
            }
            .toolbar {
                ImportToolbarButton()
                ToolbarItem(placement: .topBarTrailing) {
                    Button { router.tab = .settings } label: {
                        ProfileAvatar(name: model.firstName, photoURL: photoURL)
                    }
                    .accessibilityLabel("Profile and settings")
                }
            }
        }
    }
}

struct ProfileAvatar: View {
    let name: String
    var photoURL: URL?

    var body: some View {
        Group {
            if let photoURL {
                AsyncImage(url: photoURL) { phase in
                    if let image = phase.image { image.resizable().scaledToFill() } else { initial }
                }
            } else {
                initial
            }
        }
        .frame(width: 30, height: 30)
        .clipShape(.circle)
    }

    private var initial: some View {
        ZStack {
            Circle().fill(HealthColor.vitals.opacity(0.2))
            Text(String(name.first.map(String.init) ?? "?").uppercased())
                .font(.subheadline.weight(.semibold))
                .foregroundStyle(HealthColor.vitals)
        }
    }
}

// MARK: - Empty state

struct InsightsEmptyState: View {
    @Environment(AppRouter.self) private var router
    let model: InsightsModel

    var body: some View {
        VStack(alignment: .leading, spacing: 20) {
            InsightsGreeting(name: model.firstName)
            Text("Nothing To Show Yet").healthHeadline()
            Text(InsightsNarrative.emptyNarrative).healthNarrative()
            HealthCard {
                HealthCardHeader(eyebrow: "Get started", title: "Import Your Results") {
                    Image(systemName: "doc.badge.plus")
                        .font(.title)
                        .foregroundStyle(HealthColor.vitals)
                        .accessibilityHidden(true)
                }
                Button("Import a PDF") { router.showImport = true }
                    .buttonStyle(.borderedProminent)
                    .tint(HealthColor.vitals)
                    .controlSize(.large)
            }
        }
    }
}

struct InsightsGreeting: View {
    let name: String
    var body: some View {
        Text("\(Greeting.timeOfDayGreeting()), \(name)")
            .font(.subheadline)
            .foregroundStyle(.secondary)
    }
}

struct BirthDatePromptCard: View {
    @Environment(AppRouter.self) private var router
    var body: some View {
        HealthCard {
            HealthCardHeader(eyebrow: "Biological age", title: "Add Your Date Of Birth") {
                Image(systemName: "calendar.badge.clock")
                    .font(.title)
                    .foregroundStyle(HealthColor.vitals)
                    .accessibilityHidden(true)
            }
            Text("Your date of birth lets LabMate compare your blood markers with your calendar age. Add it in Settings to see an estimate.")
                .font(.callout).foregroundStyle(.secondary)
            Button("Go to Settings") { router.tab = .settings }
                .buttonStyle(.bordered)
        }
    }
}

// MARK: - Previews

#Preview("Insights") {
    InsightsContent(model: InsightsPreviewData.model)
        .environment(AppRouter())
}

#Preview("Insights - dark") {
    InsightsContent(model: InsightsPreviewData.model)
        .environment(AppRouter())
        .preferredColorScheme(.dark)
}

#Preview("Insights - no bio age") {
    InsightsContent(model: InsightsPreviewData.modelWithoutBioAge)
        .environment(AppRouter())
}

#Preview("Insights - empty") {
    InsightsContent(model: InsightsPreviewData.emptyModel)
        .environment(AppRouter())
}
