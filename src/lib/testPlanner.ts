import { TEST_GROUPS, type TestGroup } from '../data/testGroups'
import { getMarker } from '../data/markerCatalog'
import { addMonthsIso, daysBetweenIso, todayIso } from './dates'
import { effectiveRange, latestResultByMarker, markerStatus } from './healthScore'
import type { MarkerResult, Profile } from '../types'

export type TestReason = 'missing' | 'overdue' | 'out_of_range_followup' | 'due_soon' | 'tested_recently'

export interface TestRecommendation {
  key: string
  label: string
  category: TestGroup['category']
  reason: TestReason
  detail: string
  lastTestedDate: string | null
  dueDate: string
  wellnessCore: boolean
  note: string
}

/**
 * A scheduling heuristic, not medical advice: combines "never tested" / "overdue for
 * its usual cadence" / "last result was out of range, recheck sooner" into a single
 * priority per test, weighted so core wellness baselines outrank niche/targeted tests
 * when due dates are close. Your GP may reasonably order things on a different
 * schedule based on your actual history.
 */
export function buildTestPlan(
  results: MarkerResult[],
  profile?: Pick<Profile, 'takesCreatineSupplement'>,
  asOfDate: string = todayIso(),
): { gp: TestRecommendation[]; private: TestRecommendation[] } {
  const latest = latestResultByMarker(results)
  const recommendations: TestRecommendation[] = []

  for (const group of TEST_GROUPS) {
    if (group.showIf === 'creatineSupplement' && !profile?.takesCreatineSupplement) continue

    const presentKeys = group.markerKeys.filter((k) => latest.has(k))

    if (presentKeys.length === 0) {
      recommendations.push({
        key: group.key,
        label: group.label,
        category: group.category,
        reason: 'missing',
        detail: "You don't have any results for this yet.",
        lastTestedDate: null,
        dueDate: asOfDate,
        wellnessCore: group.wellnessCore,
        note: group.note,
      })
      continue
    }

    if (group.onceOnly) continue // already tested at least once, and it doesn't need repeating

    const lastTestedDate = presentKeys.reduce((latestDate, k) => {
      const d = latest.get(k)!.date
      return d > latestDate ? d : latestDate
    }, presentKeys[0] ? latest.get(presentKeys[0])!.date : asOfDate)

    const outOfRangeMarkers = presentKeys
      .map((k) => ({ key: k, result: latest.get(k)!, marker: getMarker(k) }))
      .filter(({ result, marker }) => {
        const status = markerStatus(result, marker)
        return status === 'high' || status === 'low'
      })

    const normalDueDate = addMonthsIso(lastTestedDate, group.intervalMonths)

    if (outOfRangeMarkers.length > 0) {
      const followUpMonths = group.outOfRangeIntervalMonths ?? 3
      const followUpDueDate = addMonthsIso(lastTestedDate, followUpMonths)
      const dueDate = followUpDueDate < normalDueDate ? followUpDueDate : normalDueDate
      const names = outOfRangeMarkers.map(({ key, marker }) => marker?.label ?? key).join(', ')
      recommendations.push({
        key: group.key,
        label: group.label,
        category: group.category,
        reason: 'out_of_range_followup',
        detail: `${names} was outside range last time - recheck sooner to track progress.`,
        lastTestedDate,
        dueDate,
        wellnessCore: group.wellnessCore,
        note: group.note,
      })
      continue
    }

    const daysUntilDue = daysBetweenIso(asOfDate, normalDueDate)
    let reason: TestReason
    let detail: string
    if (daysUntilDue <= 0) {
      reason = 'overdue'
      detail = `Last done ${formatMonthsAgo(lastTestedDate, asOfDate)} - due for a routine repeat (every ${group.intervalMonths} months).`
    } else if (daysUntilDue <= 45) {
      reason = 'due_soon'
      detail = `Due soon - last done ${formatMonthsAgo(lastTestedDate, asOfDate)}, on a ${group.intervalMonths}-month cadence.`
    } else {
      reason = 'tested_recently'
      detail = `Last done ${formatMonthsAgo(lastTestedDate, asOfDate)} - not due yet on its ${group.intervalMonths}-month cadence.`
    }

    recommendations.push({
      key: group.key,
      label: group.label,
      category: group.category,
      reason,
      detail,
      lastTestedDate,
      dueDate: normalDueDate,
      wellnessCore: group.wellnessCore,
      note: group.note,
    })
  }

  const sorted = recommendations.sort((a, b) => urgencyScore(b, asOfDate) - urgencyScore(a, asOfDate))
  return {
    gp: sorted.filter((r) => r.category === 'gp'),
    private: sorted.filter((r) => r.category === 'private'),
  }
}

/** Higher = more urgent. Days overdue, plus a bonus for core wellness tests so they surface ahead of niche tests due around the same time. */
function urgencyScore(r: TestRecommendation, asOfDate: string): number {
  const daysOverdue = daysBetweenIso(r.dueDate, asOfDate)
  const wellnessBonus = r.wellnessCore ? 60 : 0
  const reasonBonus = r.reason === 'missing' ? 30 : r.reason === 'out_of_range_followup' ? 20 : 0
  return daysOverdue + wellnessBonus + reasonBonus
}

function formatMonthsAgo(dateIso: string, asOfDate: string): string {
  const days = daysBetweenIso(dateIso, asOfDate)
  const months = Math.round(days / 30.44)
  if (months <= 0) return 'this month'
  if (months === 1) return '1 month ago'
  if (months < 24) return `${months} months ago`
  return `${Math.round(months / 12)} years ago`
}

/** Recommendations worth actually surfacing to the user - drops tests that were tested recently and aren't due, so the plan stays a short actionable list. */
export function actionableOnly(recs: TestRecommendation[]): TestRecommendation[] {
  return recs.filter((r) => r.reason !== 'tested_recently')
}
