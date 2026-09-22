import { CATEGORIES, MARKER_CATALOG } from '../data/markerCatalog'
import type { MarkerCategory, MarkerDef, MarkerResult, Profile } from '../types'

/** True when a marker is relevant to the given sex - sex-specific markers (PSA, CA-125) are excluded for the other sex. Unset sex shows everything. */
function appliesToSex(marker: MarkerDef, sex: Profile['sex'] | undefined): boolean {
  return !marker.sexSpecific || !sex || marker.sexSpecific === sex
}

export type MarkerStatus = 'in_range' | 'low' | 'high' | 'unknown'

export interface EffectiveRange {
  low: number | null
  high: number | null
  /** True when this range came from the marker's general standard range, not the lab's own printed range. */
  isStandard: boolean
}

/**
 * A result's own printed range always wins. Only when a result has no printed
 * range at all do we fall back to the marker's general standard range, so a
 * tested value doesn't sit stuck as "unknown" just because a report omitted
 * its reference interval.
 */
export function effectiveRange(result: MarkerResult, marker?: MarkerDef): EffectiveRange {
  if (result.rangeLow !== null || result.rangeHigh !== null) {
    return { low: result.rangeLow, high: result.rangeHigh, isStandard: false }
  }
  if (marker && (marker.standardRangeLow != null || marker.standardRangeHigh != null)) {
    return { low: marker.standardRangeLow ?? null, high: marker.standardRangeHigh ?? null, isStandard: true }
  }
  return { low: null, high: null, isStandard: false }
}

export function markerStatus(result: MarkerResult, marker?: MarkerDef): MarkerStatus {
  if (result.value === null) return 'unknown'
  const range = effectiveRange(result, marker)
  if (range.low === null && range.high === null) return 'unknown'
  if (range.low !== null && result.value < range.low) return 'low'
  if (range.high !== null && result.value > range.high) return 'high'
  return 'in_range'
}

export function latestResultByMarker(results: MarkerResult[]): Map<string, MarkerResult> {
  const latest = new Map<string, MarkerResult>()
  for (const r of results) {
    if (r.value === null) continue
    const current = latest.get(r.markerKey)
    if (!current || r.date > current.date) latest.set(r.markerKey, r)
  }
  return latest
}

export interface CategoryCoverage {
  category: MarkerCategory
  label: string
  totalMarkers: number
  testedMarkers: number
  inRangeCount: number
  outOfRangeCount: number
  percentInRange: number | null
}

const MANUAL_TRACKING_CATEGORIES: MarkerCategory[] = ['aerobic_fitness', 'body_composition', 'custom']

export function coverageByCategory(results: MarkerResult[], sex?: Profile['sex']): CategoryCoverage[] {
  const latest = latestResultByMarker(results)
  return CATEGORIES.filter((c) => !MANUAL_TRACKING_CATEGORIES.includes(c.key)).map((cat) => {
    const markersInCategory = MARKER_CATALOG.filter(
      (m) => m.category === cat.key && !m.manualOnly && appliesToSex(m, sex),
    )
    let tested = 0
    let inRange = 0
    let outOfRange = 0
    for (const m of markersInCategory) {
      const r = latest.get(m.key)
      if (!r) continue
      tested++
      const status = markerStatus(r, m)
      if (status === 'in_range') inRange++
      else if (status === 'low' || status === 'high') outOfRange++
    }
    return {
      category: cat.key,
      label: cat.label,
      totalMarkers: markersInCategory.length,
      testedMarkers: tested,
      inRangeCount: inRange,
      outOfRangeCount: outOfRange,
      percentInRange: tested > 0 ? Math.round((inRange / tested) * 100) : null,
    }
  })
}

export interface OverallCoverage {
  totalMarkers: number
  testedMarkers: number
  inRangeCount: number
  outOfRangeCount: number
  percentInRange: number | null
}

export function overallCoverage(results: MarkerResult[], sex?: Profile['sex']): OverallCoverage {
  const byCategory = coverageByCategory(results, sex)
  const totalMarkers = byCategory.reduce((s, c) => s + c.totalMarkers, 0)
  const testedMarkers = byCategory.reduce((s, c) => s + c.testedMarkers, 0)
  const inRangeCount = byCategory.reduce((s, c) => s + c.inRangeCount, 0)
  const outOfRangeCount = byCategory.reduce((s, c) => s + c.outOfRangeCount, 0)
  return {
    totalMarkers,
    testedMarkers,
    inRangeCount,
    outOfRangeCount,
    percentInRange: testedMarkers > 0 ? Math.round((inRangeCount / testedMarkers) * 100) : null,
  }
}

/** Most recent result date across everything imported/logged, or null with no results. */
export function lastUpdatedDate(results: MarkerResult[]): string | null {
  if (results.length === 0) return null
  return results.reduce((latest, r) => (r.date > latest ? r.date : latest), results[0].date)
}
