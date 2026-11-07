import Foundation

// Port of src/lib/testPlanner.ts.

nonisolated enum TestReason: String, Sendable {
    case missing, overdue, out_of_range_followup, due_soon, tested_recently
}

nonisolated struct TestRecommendation: Sendable, Identifiable {
    var key: String
    var label: String
    var category: TestGroup.Category
    var reason: TestReason
    var detail: String
    var lastTestedDate: String?
    var dueDate: String
    var wellnessCore: Bool
    var note: String
    var id: String { key }
}

nonisolated struct TestPlan: Sendable {
    var gp: [TestRecommendation]
    var `private`: [TestRecommendation]
}

nonisolated enum TestPlanner {
    /**
     * A scheduling heuristic, not medical advice: combines "never tested" / "overdue for
     * its usual cadence" / "last result was out of range, recheck sooner" into a single
     * priority per test, weighted so core wellness baselines outrank niche/targeted tests
     * when due dates are close. Your GP may reasonably order things on a different
     * schedule based on your actual history.
     */
    static func buildTestPlan(
        _ results: [MarkerResult],
        takesCreatineSupplement: Bool? = nil,
        asOfDate: String = DateUtils.todayIso()
    ) -> TestPlan {
        let latest = HealthScore.latestResultByMarker(results)
        var recommendations: [TestRecommendation] = []

        for group in TestGroups.all {
            if group.showIf == .creatineSupplement && takesCreatineSupplement != true { continue }

            let presentKeys = group.markerKeys.filter { latest[$0] != nil }

            if presentKeys.isEmpty {
                recommendations.append(TestRecommendation(
                    key: group.key, label: group.label, category: group.category,
                    reason: .missing,
                    detail: "You don't have any results for this yet.",
                    lastTestedDate: nil, dueDate: asOfDate,
                    wellnessCore: group.wellnessCore, note: group.note
                ))
                continue
            }

            if group.onceOnly { continue } // already tested at least once, and it doesn't need repeating

            let lastTestedDate = presentKeys.reduce(latest[presentKeys[0]]!.date) { latestDate, k in
                let d = latest[k]!.date
                return d > latestDate ? d : latestDate
            }

            let outOfRangeMarkers = presentKeys
                .map { (key: $0, result: latest[$0]!, marker: MarkerCatalog.marker($0)) }
                .filter { item in
                    let status = HealthScore.markerStatus(item.result, item.marker)
                    return status == .high || status == .low
                }

            let normalDueDate = DateUtils.addMonthsIso(lastTestedDate, group.intervalMonths)

            if !outOfRangeMarkers.isEmpty {
                let followUpMonths = group.outOfRangeIntervalMonths ?? 3
                let followUpDueDate = DateUtils.addMonthsIso(lastTestedDate, followUpMonths)
                let dueDate = followUpDueDate < normalDueDate ? followUpDueDate : normalDueDate
                let names = outOfRangeMarkers.map { $0.marker?.label ?? $0.key }.joined(separator: ", ")
                recommendations.append(TestRecommendation(
                    key: group.key, label: group.label, category: group.category,
                    reason: .out_of_range_followup,
                    detail: "\(names) was outside range last time - recheck sooner to track progress.",
                    lastTestedDate: lastTestedDate, dueDate: dueDate,
                    wellnessCore: group.wellnessCore, note: group.note
                ))
                continue
            }

            let daysUntilDue = DateUtils.daysBetweenIso(asOfDate, normalDueDate)
            let reason: TestReason
            let detail: String
            if daysUntilDue <= 0 {
                reason = .overdue
                detail = "Last done \(formatMonthsAgo(lastTestedDate, asOfDate)) - due for a routine repeat (every \(group.intervalMonths) months)."
            } else if daysUntilDue <= 45 {
                reason = .due_soon
                detail = "Due soon - last done \(formatMonthsAgo(lastTestedDate, asOfDate)), on a \(group.intervalMonths)-month cadence."
            } else {
                reason = .tested_recently
                detail = "Last done \(formatMonthsAgo(lastTestedDate, asOfDate)) - not due yet on its \(group.intervalMonths)-month cadence."
            }

            recommendations.append(TestRecommendation(
                key: group.key, label: group.label, category: group.category,
                reason: reason, detail: detail,
                lastTestedDate: lastTestedDate, dueDate: normalDueDate,
                wellnessCore: group.wellnessCore, note: group.note
            ))
        }

        // Stable descending sort by urgency (JS Array.sort is stable).
        let sorted = recommendations.enumerated()
            .map { (offset: $0.offset, rec: $0.element, score: urgencyScore($0.element, asOfDate)) }
            .sorted { $0.score != $1.score ? $0.score > $1.score : $0.offset < $1.offset }
            .map(\.rec)
        return TestPlan(
            gp: sorted.filter { $0.category == .gp },
            private: sorted.filter { $0.category == .private }
        )
    }

    /// Higher = more urgent. Days overdue, plus a bonus for core wellness tests so they surface ahead of niche tests due around the same time.
    private static func urgencyScore(_ r: TestRecommendation, _ asOfDate: String) -> Int {
        let daysOverdue = DateUtils.daysBetweenIso(r.dueDate, asOfDate)
        let wellnessBonus = r.wellnessCore ? 60 : 0
        let reasonBonus = r.reason == .missing ? 30 : r.reason == .out_of_range_followup ? 20 : 0
        return daysOverdue + wellnessBonus + reasonBonus
    }

    private static func formatMonthsAgo(_ dateIso: String, _ asOfDate: String) -> String {
        let days = DateUtils.daysBetweenIso(dateIso, asOfDate)
        let months = Int(JSFormat.round(Double(days) / 30.44))
        if months <= 0 { return "this month" }
        if months == 1 { return "1 month ago" }
        if months < 24 { return "\(months) months ago" }
        return "\(Int(JSFormat.round(Double(months) / 12))) years ago"
    }

    /// Recommendations worth actually surfacing to the user - drops tests that were tested recently and aren't due, so the plan stays a short actionable list.
    static func actionableOnly(_ recs: [TestRecommendation]) -> [TestRecommendation] {
        recs.filter { $0.reason != .tested_recently }
    }
}
