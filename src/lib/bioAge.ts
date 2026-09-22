import { getMarker } from '../data/markerCatalog'
import type { MarkerResult } from '../types'
import { ageInYears } from './dates'
import { effectiveRange } from './healthScore'
import { cystatinCEgfr, normalisedCreatinineFromCystatinC } from './kidneyFunction'

/**
 * Estimated biological age using the published PhenoAge algorithm
 * (Levine et al., 2018, "An epigenetic biomarker of aging for lifespan and
 * healthspan", Aging (Albany NY)).
 *
 * IMPORTANT: the coefficients below are reproduced from general knowledge of the
 * published formula, not re-verified against the paper in this session. Treat this
 * as an illustrative estimate, not a clinical or diagnostic result - and don't
 * confuse it with Everlab's (or any other service's) proprietary biological-age
 * score, which uses a different, undisclosed method.
 */
const PHENOAGE_INPUTS = [
  { key: 'albumin', label: 'Albumin', unit: 'g/L' },
  { key: 'creatinine', label: 'Creatinine', unit: 'umol/L' },
  { key: 'glucose', label: 'Glucose', unit: 'mmol/L' },
  { key: 'hs_crp', label: 'hs-CRP', unit: 'mg/L' },
  { key: 'lymphocyte_percent', label: 'Lymphocyte %', unit: '%' },
  { key: 'mcv', label: 'MCV', unit: 'fL' },
  { key: 'rdw', label: 'RDW', unit: '%' },
  { key: 'alp', label: 'ALP', unit: 'U/L' },
  { key: 'wcc', label: 'White Cell Count', unit: 'x10^9/L' },
] as const

type PhenoAgeKey = (typeof PHENOAGE_INPUTS)[number]['key']
type PhenoInputs = Record<PhenoAgeKey, number>

// General, non-personalised levers commonly associated with each marker. Not medical
// advice - directional starting points to discuss with a doctor, not a treatment plan.
const IMPROVEMENT_TIPS: Record<PhenoAgeKey, string> = {
  albumin: 'often reflects protein intake and liver/gut health.',
  creatinine: 'mostly reflects muscle mass and kidney filtration - stay well hydrated before a retest.',
  glucose: 'responds to refined carbs/alcohol intake, body composition, sleep and activity.',
  hs_crp: 'a general inflammation marker - sleep, weight, dental health, exercise and infections all move it.',
  lymphocyte_percent: 'shifts with recent infections/illness and overall immune load.',
  mcv: 'often tracks B12, folate or iron status.',
  rdw: 'often tracks B12, folate or iron status.',
  alp: 'reflects liver and bone turnover.',
  wcc: 'rises with infection, inflammation or physical stress.',
}

function phenoAgeFromInputs(inputs: PhenoInputs, chronologicalAge: number): number {
  const xb =
    -19.907 +
    -0.0336 * inputs.albumin +
    0.0095 * inputs.creatinine +
    0.1953 * inputs.glucose +
    0.0954 * Math.log(Math.max(inputs.hs_crp, 0.01)) +
    -0.012 * inputs.lymphocyte_percent +
    0.0268 * inputs.mcv +
    0.3306 * inputs.rdw +
    0.00188 * inputs.alp +
    0.0554 * inputs.wcc +
    0.0804 * chronologicalAge

  const gamma = 0.0076927
  const mortalityScore = 1 - Math.exp((-Math.exp(xb) * (Math.exp(gamma * 120) - 1)) / gamma)
  return 141.50225 + Math.log(-0.00553 * Math.log(1 - mortalityScore)) / 0.09165
}

function referencePoint(range: { low: number | null; high: number | null }): number | null {
  if (range.low !== null && range.high !== null) return (range.low + range.high) / 2
  if (range.high !== null) return range.high
  if (range.low !== null) return range.low
  return null
}

export interface BioAgeContribution {
  key: PhenoAgeKey
  label: string
  unit: string
  value: number
  /** Years this marker is currently adding (positive) or subtracting (negative) vs. its own reference point, all else held equal. */
  contributionYears: number
  direction: 'lower' | 'raise'
  referenceDescription: string
  tip: string
}

export interface BioAgeResult {
  phenoAge: number
  chronologicalAge: number
  delta: number
  asOfDate: string
  usedResults: Record<string, MarkerResult>
  /** Markers currently pushing the estimate older, ranked by impact (largest first). */
  topContributors: BioAgeContribution[]
  /** Set when a contributor was left out of the ranking above for a documented reason (e.g. creatine supplementation), so the UI can explain the omission. */
  excludedNote?: string
  /**
   * What the same, unmodified PhenoAge formula would output if creatinine sat at the
   * middle of its reference range instead of your actual reading - shown alongside the
   * real estimate (never in place of it) when you've flagged creatine supplementation
   * and your creatinine is actually elevated, so you can see the size of that effect.
   */
  phenoAgeExcludingCreatinine?: number
  /**
   * Cystatin C-based eGFR (doesn't depend on creatinine, so creatine supplementation
   * doesn't affect it) - shown as independent supporting evidence when you've flagged
   * creatine supplementation and have a Cystatin C result, alongside (never instead of)
   * the real PhenoAge estimate above.
   */
  cystatinCEgfr?: number
  /**
   * The creatinine (umol/L) your age/sex would be expected to produce at your Cystatin
   * C-based eGFR - i.e. what creatinine would likely read if it reflected only kidney
   * filtration, not the extra load from creatine supplementation. Derived by inverting
   * the standard creatinine-based eGFR equation against your Cystatin-C eGFR.
   */
  normalisedCreatinine?: number
  /**
   * PhenoAge recomputed with normalisedCreatinine in place of your real creatinine
   * reading - a creatine-adjusted biological age, shown alongside (never in place of)
   * the real phenoAge above. Only available when you've flagged creatine supplementation
   * and have a Cystatin C result.
   */
  phenoAgeCreatineAdjusted?: number
}

export interface BioAgeUnavailable {
  missing: { key: string; label: string }[]
}

export function computeBioAge(
  latestByMarker: Map<string, MarkerResult>,
  birthDate: string,
  profile?: { takesCreatineSupplement?: boolean; sex?: 'M' | 'F' | null },
): BioAgeResult | BioAgeUnavailable {
  const missing = PHENOAGE_INPUTS.filter((i) => !latestByMarker.has(i.key)).map((i) => ({ key: i.key, label: i.label }))
  if (missing.length > 0) return { missing }

  const used: Record<string, MarkerResult> = {}
  for (const input of PHENOAGE_INPUTS) used[input.key] = latestByMarker.get(input.key)!

  const inputs = Object.fromEntries(PHENOAGE_INPUTS.map((i) => [i.key, used[i.key].value!])) as PhenoInputs

  const asOfDate = Object.values(used).reduce((latest, r) => (r.date > latest ? r.date : latest), used.albumin.date)
  const chronologicalAge = ageInYears(birthDate, asOfDate)

  const phenoAge = phenoAgeFromInputs(inputs, chronologicalAge)

  // If we have a Cystatin C result and know sex, derive a creatine-adjusted biological
  // age: Cystatin C -> eGFR (unaffected by creatine) -> invert the standard creatinine
  // eGFR equation to get the creatinine your kidneys "should" produce at that eGFR ->
  // feed that normalised creatinine into the same PhenoAge formula. Computed independent
  // of whether creatinine is actually a top contributor this time, so it's available
  // whenever the inputs support it.
  let cystatinEgfr: number | undefined
  let normalisedCreatinine: number | undefined
  let phenoAgeCreatineAdjusted: number | undefined
  if (profile?.takesCreatineSupplement && profile.sex) {
    const cystatinResult = latestByMarker.get('cystatin_c')
    if (cystatinResult?.value != null) {
      cystatinEgfr = cystatinCEgfr(cystatinResult.value, chronologicalAge, profile.sex)
      normalisedCreatinine = normalisedCreatinineFromCystatinC(cystatinResult.value, chronologicalAge, profile.sex)
      phenoAgeCreatineAdjusted = phenoAgeFromInputs({ ...inputs, creatinine: normalisedCreatinine }, chronologicalAge)
    }
  }

  // For each input, ask "what would my estimate be if this one marker sat at the
  // middle of its own reference range instead?" - the gap between that and the real
  // estimate is how many years that marker's current value is currently adding or
  // removing, holding everything else fixed.
  let excludedNote: string | undefined
  let phenoAgeExcludingCreatinine: number | undefined
  const topContributors: BioAgeContribution[] = []
  for (const input of PHENOAGE_INPUTS) {
    const result = used[input.key]
    const marker = getMarker(input.key)
    const range = effectiveRange(result, marker)
    const reference = referencePoint(range)
    if (reference === null) continue

    const counterfactual = phenoAgeFromInputs({ ...inputs, [input.key]: reference }, chronologicalAge)
    const contributionYears = phenoAge - counterfactual
    // Only surface markers currently pushing the estimate older - moving those toward
    // the reference point is what actually helps. A marker with a negative contribution
    // is already helping (e.g. a naturally protective value), not something to "fix".
    if (contributionYears < 0.05) continue

    // Creatine supplementation raises serum creatinine independent of kidney function
    // (it's the metabolic source of creatinine), so "lower your creatinine" is misleading
    // advice for a supplement user even though the raw PhenoAge math still uses the real
    // reading - we don't alter the formula, only which drivers we tell the user to act on.
    if (input.key === 'creatinine' && profile?.takesCreatineSupplement) {
      excludedNote =
        "Creatinine is excluded below - you've noted you take a creatine supplement, which raises creatinine independent of kidney function."
      phenoAgeExcludingCreatinine = counterfactual
      if (cystatinEgfr !== undefined && normalisedCreatinine !== undefined) {
        excludedNote +=
          ` Your Cystatin C-based eGFR - a kidney-function estimate that doesn't depend on creatinine at all - is ` +
          `~${cystatinEgfr.toFixed(0)} mL/min/1.73m² (${cystatinEgfr >= 60 ? 'normal range' : 'below the usual 60 cutoff, worth discussing with your doctor'}), ` +
          `which corresponds to a normalised creatinine of ~${normalisedCreatinine.toFixed(0)} umol/L - see the creatine-adjusted biological age above.`
      }
      continue
    }

    const direction: 'lower' | 'raise' = inputs[input.key] > reference ? 'lower' : 'raise'
    const referenceDescription =
      range.low !== null && range.high !== null
        ? `${range.low} - ${range.high}${range.isStandard ? ' (general range)' : ''}`
        : range.high !== null
          ? `< ${range.high}${range.isStandard ? ' (general range)' : ''}`
          : `> ${range.low}${range.isStandard ? ' (general range)' : ''}`

    topContributors.push({
      key: input.key,
      label: input.label,
      unit: input.unit,
      value: inputs[input.key],
      contributionYears,
      direction,
      referenceDescription,
      tip: IMPROVEMENT_TIPS[input.key],
    })
  }
  topContributors.sort((a, b) => b.contributionYears - a.contributionYears)

  return {
    phenoAge,
    chronologicalAge,
    delta: phenoAge - chronologicalAge,
    asOfDate,
    usedResults: used,
    topContributors,
    excludedNote,
    phenoAgeExcludingCreatinine,
    cystatinCEgfr: cystatinEgfr,
    normalisedCreatinine,
    phenoAgeCreatineAdjusted,
  }
}

export function isBioAgeAvailable(r: BioAgeResult | BioAgeUnavailable): r is BioAgeResult {
  return 'phenoAge' in r
}
