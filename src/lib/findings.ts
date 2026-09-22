import { CATEGORIES, getMarker } from '../data/markerCatalog'
import { effectiveRange, latestResultByMarker, markerStatus } from './healthScore'
import type { MarkerCategory, MarkerResult } from '../types'

/**
 * Generic, widely-known "what a doctor commonly looks at" context per category -
 * deliberately NOT specific causes, timelines or supplement doses for your results.
 * We don't have a clinical basis to tell you why your levels moved or how fast
 * they'll change, and inventing that would be worse than saying nothing. What we can
 * do is point at the well-established questions/follow-ups people in this situation
 * usually discuss with a doctor.
 */
const CATEGORY_GUIDANCE: Partial<Record<MarkerCategory, { askYourDoctor: string[]; possibleNextSteps: string[] }>> = {
  liver: {
    askYourDoctor: [
      'What could be causing these liver enzyme changes?',
      'Should I review my alcohol intake, or any medications/supplements I take?',
      'Do I need imaging (e.g. an ultrasound) or further blood tests?',
    ],
    possibleNextSteps: [
      'Repeat liver function tests to confirm the trend rather than a one-off reading',
      'Hepatitis B/C serology',
      'Liver ultrasound',
    ],
  },
  heart_lipids: {
    askYourDoctor: [
      "What's my overall cardiovascular risk, not just this one number?",
      'Would ApoB or Lp(a) testing add anything for me if I haven\'t had them?',
      'Are lifestyle changes enough, or should we discuss other options?',
    ],
    possibleNextSteps: [
      'Repeat the lipid profile after any lifestyle changes to see if it moved',
      'A coronary calcium score if you have other risk factors',
    ],
  },
  electrolytes_kidney: {
    askYourDoctor: [
      'Is this a one-off or a trend for my kidney function/electrolytes?',
      'Could hydration, medications or supplements be affecting this result?',
      'Do I need a urine test (albumin:creatinine ratio) as well?',
    ],
    possibleNextSteps: ['Repeat the kidney function/electrolyte panel to confirm the trend'],
  },
  metabolic: {
    askYourDoctor: [
      'Does this suggest a trend toward insulin resistance or diabetes?',
      'Would a fasting insulin or oral glucose tolerance test add useful information?',
    ],
    possibleNextSteps: ['Repeat HbA1c/glucose in a few months', 'Discuss whether an OGTT is appropriate'],
  },
  iron: {
    askYourDoctor: [
      'Is this iron result something to act on, or just monitor?',
      'Could diet, blood loss or absorption explain this?',
    ],
    possibleNextSteps: ['Repeat iron studies', 'A coeliac screen or GI review if iron stays persistently low'],
  },
  hormones: {
    askYourDoctor: ['What does this mean given my age/sex and symptoms (if any)?', 'Should we repeat this with a same-time-of-day sample?'],
    possibleNextSteps: ['Repeat TSH with free T4/T3', 'Thyroid antibodies if not already checked'],
  },
  nutrition: {
    askYourDoctor: ["Do I need to supplement, and if so what's a safe dose for me?", 'Is a more sensitive test (e.g. active B12) worth doing?'],
    possibleNextSteps: ['Discuss supplementation and dosing directly with your GP or pharmacist - not something we\'ll estimate here'],
  },
  gut_health: {
    askYourDoctor: ['Do my symptoms and this result warrant a specialist review?'],
    possibleNextSteps: ['Discuss with your GP whether a gastroenterology referral is warranted'],
  },
}

export interface FindingMarker {
  key: string
  label: string
  value: number
  unit: string
  status: 'high' | 'low'
  rangeLow: number | null
  rangeHigh: number | null
  rangeText: string
  isStandard: boolean
}

export interface Finding {
  category: MarkerCategory
  categoryLabel: string
  outOfRangeCount: number
  testedCount: number
  markers: FindingMarker[]
  askYourDoctor: string[]
  possibleNextSteps: string[]
}

/**
 * Only surfaces categories with at least one out-of-range marker - this is meant to
 * be a short "what's actually flagged" list, not a restatement of everything you've
 * ever tested normal for.
 */
export function buildFindings(results: MarkerResult[]): Finding[] {
  const latest = latestResultByMarker(results)
  const findings: Finding[] = []

  for (const cat of CATEGORIES) {
    const markersInCategory = [...latest.entries()]
      .map(([key, result]) => ({ result, marker: getMarker(key) }))
      .filter(({ marker }) => marker?.category === cat.key)

    if (markersInCategory.length === 0) continue

    const outOfRange: FindingMarker[] = []
    for (const { result, marker } of markersInCategory) {
      const status = markerStatus(result, marker)
      if (status !== 'high' && status !== 'low') continue
      const range = effectiveRange(result, marker)
      outOfRange.push({
        key: result.markerKey,
        label: marker?.label ?? result.rawName,
        value: result.value as number,
        unit: result.unit || marker?.defaultUnit || '',
        status,
        rangeLow: range.low,
        rangeHigh: range.high,
        rangeText: result.rangeText || marker?.standardRangeText || '',
        isStandard: range.isStandard,
      })
    }

    if (outOfRange.length === 0) continue

    const guidance = CATEGORY_GUIDANCE[cat.key]
    findings.push({
      category: cat.key,
      categoryLabel: cat.label,
      outOfRangeCount: outOfRange.length,
      testedCount: markersInCategory.length,
      markers: outOfRange,
      askYourDoctor: guidance?.askYourDoctor ?? ['What might be causing this, and is it worth monitoring or acting on?'],
      possibleNextSteps: guidance?.possibleNextSteps ?? ['Discuss whether a repeat test is worthwhile'],
    })
  }

  return findings.sort((a, b) => b.outOfRangeCount - a.outOfRangeCount)
}
