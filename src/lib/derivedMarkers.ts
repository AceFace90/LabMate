import type { MarkerResult } from '../types'

/**
 * Lymphocytes % = (Absolute Lymphocyte Count / Total White Cell Count) x 100.
 * When a date has WCC plus exactly one of {Lymphocytes (absolute), Lymphocytes %},
 * fill in the missing one automatically rather than leaving it untested.
 */
export function deriveComputedMarkers(results: MarkerResult[]): MarkerResult[] {
  const byDate = new Map<string, MarkerResult[]>()
  for (const r of results) {
    if (r.value === null) continue
    const list = byDate.get(r.date) ?? []
    list.push(r)
    byDate.set(r.date, list)
  }

  const derived: MarkerResult[] = []
  for (const [date, rows] of byDate) {
    const wcc = rows.find((r) => r.markerKey === 'wcc')
    const lymphAbs = rows.find((r) => r.markerKey === 'lymphocytes')
    const lymphPct = rows.find((r) => r.markerKey === 'lymphocyte_percent')
    if (!wcc || wcc.value === null) continue

    if (lymphAbs && lymphAbs.value !== null && !lymphPct) {
      const pct = (lymphAbs.value / wcc.value) * 100
      derived.push(makeDerived('lymphocyte_percent', 'Lymphocytes %', date, pct, '%', lymphAbs))
    } else if (lymphPct && lymphPct.value !== null && !lymphAbs) {
      const abs = (lymphPct.value / 100) * wcc.value
      derived.push(makeDerived('lymphocytes', 'Lymphocytes', date, abs, 'x10^9/L', lymphPct))
    }
  }
  return derived
}

function makeDerived(
  markerKey: string,
  rawName: string,
  date: string,
  value: number,
  unit: string,
  source: MarkerResult,
): MarkerResult {
  const rounded = Math.round(value * 100) / 100
  return {
    id: crypto.randomUUID(),
    markerKey,
    rawName,
    date,
    value: rounded,
    displayValue: String(rounded),
    flag: '',
    rangeLow: null,
    rangeHigh: null,
    rangeText: '',
    unit,
    sourceFile: source.sourceFile,
    panel: source.panel,
    addedManually: false,
    derived: true,
    createdAt: new Date().toISOString(),
  }
}
