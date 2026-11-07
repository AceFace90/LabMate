import SwiftUI

/// Test Plan tab. Port of TestPlan.tsx in the redesigned-Health style: hero headline + narrative,
/// then one card per group (GP / private), each row's status shown in colour.
struct TestPlanView: View {
    @Environment(AppStore.self) private var store

    private var plan: TestPlan {
        TestPlanner.buildTestPlan(store.allResults, takesCreatineSupplement: store.profile.takesCreatineSupplement)
    }

    var body: some View {
        NavigationStack {
            TestPlanContent(plan: plan)
                .navigationTitle("Test Plan")
                .navigationBarTitleDisplayMode(.large)
                .toolbar { ImportToolbarButton() }
        }
    }
}

private extension TestReason {
    var label: String {
        switch self {
        case .missing: "Never tested"
        case .overdue: "Overdue"
        case .out_of_range_followup: "Follow-up"
        case .due_soon: "Due soon"
        case .tested_recently: "Up to date"
        }
    }
    var color: Color {
        switch self {
        case .missing: HealthColor.serious
        case .overdue: HealthColor.warning
        case .out_of_range_followup: HealthColor.critical
        case .due_soon: HealthColor.vitals
        case .tested_recently: HealthColor.good
        }
    }
    var symbol: String {
        switch self {
        case .missing: "questionmark.circle.fill"
        case .overdue: "clock.badge.exclamationmark.fill"
        case .out_of_range_followup: "arrow.triangle.2.circlepath.circle.fill"
        case .due_soon: "calendar.circle.fill"
        case .tested_recently: "checkmark.circle.fill"
        }
    }
}

struct TestPlanContent: View {
    let plan: TestPlan

    private var gp: [TestRecommendation] { TestPlanner.actionableOnly(plan.gp) }
    private var priv: [TestRecommendation] { TestPlanner.actionableOnly(plan.private) }
    private var total: Int { gp.count + priv.count }

    private var headline: String {
        total == 0 ? "All Up to Date" : "\(total) Test\(total == 1 ? "" : "s") Due"
    }

    private var narrative: String {
        if total == 0 { return "You're up to date. Nothing is due right now based on what's been imported so far." }
        let followUps = (gp + priv).filter { $0.reason == .out_of_range_followup }.count
        let never = (gp + priv).filter { $0.reason == .missing }.count
        var parts: [String] = []
        if never > 0 { parts.append("\(never) never tested") }
        if followUps > 0 { parts.append("\(followUps) worth rechecking sooner") }
        let extra = parts.isEmpty ? "" : " (" + parts.joined(separator: ", ") + ")"
        return "Based on your results and each test's usual cadence\(extra). Core wellness baselines are ranked first."
    }

    var body: some View {
        HealthPage {
            VStack(alignment: .leading, spacing: 8) {
                Text(headline).healthHeadline()
                Text(narrative).healthNarrative()
            }
            .padding(.top, 8)
            .accessibilityElement(children: .combine)
            .accessibilityAddTraits(.isHeader)

            if total > 0 {
                groupCard(title: "From Your GP", eyebrow: "Standard referral", symbol: "stethoscope", tint: HealthColor.vitals, recs: gp)
                groupCard(title: "Private / Specialist", eyebrow: "Self-funded or booked separately", symbol: "cross.case.fill", tint: HealthColor.purple, recs: priv)
            }

            Text("A scheduling heuristic, not medical advice. It combines what you've never tested, what's overdue for its usual cadence, and what was last out of range and worth rechecking sooner, weighted so core wellness baselines (FBC, kidney/liver/lipids, thyroid, HbA1c, VO2 max, body composition) rank above niche tests due around the same time. Your GP may reasonably order things differently based on your actual history.")
                .font(.footnote)
                .foregroundStyle(.secondary)
                .padding(.horizontal, 4)
        }
    }

    @ViewBuilder
    private func groupCard(title: String, eyebrow: String, symbol: String, tint: Color, recs: [TestRecommendation]) -> some View {
        HealthCard {
            HealthCardHeader(eyebrow: eyebrow, title: title) {
                Image(systemName: symbol).font(.title2).foregroundStyle(tint)
                    .accessibilityHidden(true)
            }
            if recs.isEmpty {
                Text("Nothing due.").font(.subheadline).foregroundStyle(.secondary)
            } else {
                ForEach(Array(recs.enumerated()), id: \.element.id) { index, rec in
                    if index > 0 { Divider() }
                    TestRow(rec: rec)
                }
            }
        }
        .accessibilityElement(children: .contain)
        .accessibilityLabel(title)
    }
}

private struct TestRow: View {
    let rec: TestRecommendation

    private var dueText: String {
        (rec.reason == .missing ? "Recommended now" : "Next due: \(DateUtils.formatIsoDate(rec.dueDate))")
            + (rec.wellnessCore ? " · core wellness check" : "")
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 4) {
            HStack(alignment: .firstTextBaseline) {
                Text(rec.label).font(.headline)
                Spacer(minLength: 8)
                Label(rec.reason.label, systemImage: rec.reason.symbol)
                    .font(.footnote.weight(.semibold))
                    .foregroundStyle(rec.reason.color)
            }
            Text(rec.detail).font(.subheadline)
            Text(dueText).font(.footnote).foregroundStyle(.secondary)
            Text(rec.note).font(.footnote).italic().foregroundStyle(.secondary)
        }
        .padding(.vertical, 2)
        .accessibilityElement(children: .combine)
        .accessibilityLabel("\(rec.label), \(rec.reason.label). \(rec.detail) \(dueText)")
    }
}

#Preview("Due") {
    let plan = TestPlanner.buildTestPlan([], takesCreatineSupplement: true)
    return NavigationStack {
        TestPlanContent(plan: plan).navigationTitle("Test Plan")
    }
}

#Preview("Up to date") {
    NavigationStack {
        TestPlanContent(plan: TestPlan(gp: [], private: [])).navigationTitle("Test Plan")
    }
}
