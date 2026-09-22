export type MarkerCategory =
  | 'electrolytes_kidney'
  | 'liver'
  | 'iron'
  | 'metabolic'
  | 'heart_lipids'
  | 'blood_marrow'
  | 'hormones'
  | 'nutrition'
  | 'gut_health'
  | 'autoimmunity'
  | 'cancer_screening'
  | 'muscle'
  | 'aerobic_fitness'
  | 'body_composition'
  | 'custom'

export interface CategoryDef {
  key: MarkerCategory
  label: string
  description: string
}

export interface MarkerDef {
  key: string
  label: string
  category: MarkerCategory
  /** Fallback unit shown when a result doesn't carry its own parsed unit. */
  defaultUnit?: string
  /** Lowercase names/synonyms this marker may appear as in a report. First match wins. */
  aliases: string[]
  description: string
  /** Phase-2 markers with no PDF source - logged by hand only. */
  manualOnly?: boolean
  /** Only relevant to one sex (e.g. PSA, CA-125) - hidden from users of the other sex. Shown to everyone when profile sex is unset. */
  sexSpecific?: 'M' | 'F'
  /**
   * General adult reference range, used only when a result carries no printed
   * range of its own. These are widely-published values from general medical
   * knowledge, not verified against a live source in this app - your lab's own
   * printed range always takes priority when present. Not medical advice.
   */
  standardRangeLow?: number | null
  standardRangeHigh?: number | null
  /** Display text for the standard range, e.g. "> 60" or "150 - 670". */
  standardRangeText?: string
}

export interface MarkerResult {
  id: string
  markerKey: string
  rawName: string
  /** ISO yyyy-mm-dd */
  date: string
  value: number | null
  /** Original text as printed, e.g. "< 0.1", "Not Detected" */
  displayValue: string
  flag: '' | '*' | '**'
  rangeLow: number | null
  rangeHigh: number | null
  rangeText: string
  unit: string
  sourceFile: string
  panel: string
  addedManually: boolean
  /** True if this value was computed from other results (e.g. Lymphocytes % from Lymphocytes/WCC), not measured or typed in directly. */
  derived?: boolean
  createdAt: string
}

export interface Profile {
  birthDate: string | null
  sex: 'M' | 'F' | null
  /**
   * Creatine supplementation raises serum creatinine independent of kidney function
   * (it's the metabolic source of creatinine), so a supplement user's creatinine can
   * read "high" without reflecting kidney health. When set, the biological-age
   * breakdown stops presenting creatinine as something to act on.
   */
  takesCreatineSupplement?: boolean
  /** Display theme. 'auto' follows the OS/browser preference; defaults to 'auto' when unset. */
  theme?: 'light' | 'dark' | 'auto'
}

/** A user-defined metric outside the built-in catalog (e.g. "Sleep score", "VO2 max (watch)"). */
export interface CustomMarker {
  key: string
  label: string
  unit: string
  createdAt: string
}
