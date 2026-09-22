/**
 * Groups the marker catalog into the actual pathology/imaging requests you'd book,
 * mirroring how tests are really ordered in Australia rather than one marker at a
 * time. 'gp' = a standard GP referral/blood request; 'private' = something you'd
 * typically need to seek out yourself (a longevity clinic, a self-funded pathology
 * request, or an imaging/exercise-physiology booking) rather than a routine GP order.
 * The gp/private split and cadences are a scheduling heuristic based on common
 * Australian pathology practice - not medical advice, and your GP may order things
 * differently based on your actual history.
 */
export interface TestGroup {
  key: string
  label: string
  category: 'gp' | 'private'
  markerKeys: string[]
  /** How often to repeat this test when the last result was unremarkable, in months. */
  intervalMonths: number
  /** Tighter re-check cadence when the last result was out of range, in months. Defaults to 3. */
  outOfRangeIntervalMonths?: number
  /** Weighted as a core wellness baseline (checked even when nothing is wrong) rather than a niche/targeted test. */
  wellnessCore: boolean
  /** Genuinely once-in-a-lifetime marker (e.g. largely genetic) - never recommended again once tested, regardless of result or age. */
  onceOnly?: boolean
  /** Only surface this recommendation when the given profile condition holds - for niche tests that aren't broadly useful. */
  showIf?: 'creatineSupplement'
  note: string
}

export const TEST_GROUPS: TestGroup[] = [
  // --- GP / standard pathology ---
  {
    key: 'fbc',
    label: 'Full Blood Count (FBC)',
    category: 'gp',
    markerKeys: [
      'haemoglobin', 'rbc', 'hct', 'mcv', 'mch', 'mchc', 'rdw', 'wcc',
      'neutrophils', 'lymphocytes', 'lymphocyte_percent', 'monocytes', 'eosinophils', 'basophils',
      'platelets', 'mpv', 'esr',
    ],
    intervalMonths: 12,
    wellnessCore: true,
    note: 'Core wellness baseline - red cells, white cells and platelets in one blood draw.',
  },
  {
    key: 'euc',
    label: 'Kidney Function & Electrolytes (EUC)',
    category: 'gp',
    markerKeys: ['sodium', 'potassium', 'chloride', 'bicarbonate', 'urea', 'creatinine', 'egfr', 'uric_acid'],
    intervalMonths: 12,
    wellnessCore: true,
    note: 'Core wellness baseline - kidney filtration and electrolyte balance.',
  },
  {
    key: 'lft',
    label: 'Liver Function (LFT)',
    category: 'gp',
    markerKeys: ['total_protein', 'albumin', 'globulin', 'alp', 'bilirubin', 'ggt', 'ast', 'alt'],
    intervalMonths: 12,
    wellnessCore: true,
    note: 'Core wellness baseline - liver enzymes and proteins.',
  },
  {
    key: 'lipids',
    label: 'Lipid Profile',
    category: 'gp',
    markerKeys: [
      'total_cholesterol', 'hdl_cholesterol', 'ldl_cholesterol', 'non_hdl_cholesterol',
      'triglyceride', 'ldl_hdl_ratio', 'chol_hdl_ratio',
    ],
    intervalMonths: 12,
    wellnessCore: true,
    note: 'Core wellness baseline - standard cardiovascular risk cholesterol panel.',
  },
  {
    key: 'diabetes_screen',
    label: 'HbA1c / Blood Glucose',
    category: 'gp',
    markerKeys: ['hba1c', 'glucose'],
    intervalMonths: 12,
    wellnessCore: true,
    note: 'Core wellness baseline - blood sugar regulation.',
  },
  {
    key: 'thyroid',
    label: 'Thyroid Function',
    category: 'gp',
    markerKeys: ['tsh', 'free_t4', 'free_t3'],
    intervalMonths: 12,
    wellnessCore: true,
    note: 'Core wellness baseline - TSH is the usual first-line test; T4/T3 are typically only added if TSH is abnormal.',
  },
  {
    key: 'iron_studies',
    label: 'Iron Studies',
    category: 'gp',
    markerKeys: ['iron', 'transferrin', 'transferrin_saturation', 'ferritin'],
    intervalMonths: 12,
    wellnessCore: false,
    note: 'Targeted check - most useful if you have fatigue symptoms or a history of low iron.',
  },
  {
    key: 'b12_folate',
    label: 'Vitamin B12 & Folate',
    category: 'gp',
    markerKeys: ['vitamin_b12', 'folate'],
    intervalMonths: 24,
    wellnessCore: false,
    note: "Doesn't shift quickly - a 2-year cadence is reasonable unless you're symptomatic or on a restricted diet.",
  },
  {
    key: 'vitamin_d',
    label: 'Vitamin D',
    category: 'gp',
    markerKeys: ['vitamin_d'],
    intervalMonths: 12,
    wellnessCore: false,
    note: 'Varies seasonally with sun exposure - worth repeating yearly, especially after winter.',
  },
  {
    key: 'minerals',
    label: 'Calcium, Phosphate & Magnesium',
    category: 'gp',
    markerKeys: ['calcium', 'corrected_calcium', 'phosphate', 'magnesium', 'zinc'],
    intervalMonths: 24,
    wellnessCore: false,
    note: 'Usually only needed opportunistically or if a related symptom/marker prompts it.',
  },
  {
    key: 'hs_crp',
    label: 'hs-CRP (Inflammation)',
    category: 'gp',
    markerKeys: ['hs_crp'],
    intervalMonths: 12,
    wellnessCore: false,
    note: 'Opportunistic cardiovascular risk/inflammation marker - useful alongside a lipid check.',
  },
  {
    key: 'faecal_calprotectin',
    label: 'Faecal Calprotectin',
    category: 'gp',
    markerKeys: ['faecal_calprotectin'],
    intervalMonths: 36,
    wellnessCore: false,
    note: 'Symptom-driven gut inflammation marker - only worth repeating if you have digestive symptoms, not on a fixed wellness schedule.',
  },

  // --- Private / specialist ---
  {
    key: 'lp_a',
    label: 'Lp(a)',
    category: 'private',
    markerKeys: ['lp_a'],
    intervalMonths: 999,
    wellnessCore: false,
    onceOnly: true,
    note: "Largely genetically determined and stable across life - most guidelines say measure it once, ever, not on a repeat schedule.",
  },
  {
    key: 'advanced_lipids',
    label: 'ApoB',
    category: 'private',
    markerKeys: ['apob'],
    intervalMonths: 12,
    wellnessCore: false,
    note: 'Often more predictive of cardiovascular risk than LDL alone - not routinely bulk-billed.',
  },
  {
    key: 'homocysteine',
    label: 'Homocysteine',
    category: 'private',
    markerKeys: ['homocysteine'],
    intervalMonths: 24,
    wellnessCore: false,
    note: 'Cardiovascular/cognitive risk marker, not part of routine GP bloods.',
  },
  {
    key: 'fasting_insulin',
    label: 'Fasting Insulin',
    category: 'private',
    markerKeys: ['insulin'],
    intervalMonths: 12,
    wellnessCore: false,
    note: 'Flags insulin resistance earlier than glucose/HbA1c alone - a longevity-panel addition, not routine.',
  },
  {
    key: 'active_b12',
    label: 'Active B12 (Holotranscobalamin)',
    category: 'private',
    markerKeys: ['active_b12'],
    intervalMonths: 24,
    wellnessCore: false,
    note: 'More sensitive early-deficiency marker than standard B12 - worth it mainly if standard B12/folate was borderline.',
  },
  {
    key: 'hormones',
    label: 'Hormone Panel (Testosterone, SHBG, Oestradiol, DHEA-S, Cortisol, FSH, LH)',
    category: 'private',
    markerKeys: ['testosterone', 'free_testosterone', 'shbg', 'estradiol', 'dhea_s', 'cortisol', 'fsh', 'lh'],
    intervalMonths: 12,
    wellnessCore: false,
    note: 'Sex- and age-dependent - useful for longevity/symptom tracking but not a universal annual requirement.',
  },
  {
    key: 'dexa',
    label: 'DEXA Scan (Body Composition & Bone Density)',
    category: 'private',
    markerKeys: ['body_fat_percent', 'lean_mass', 'visceral_fat_rating', 'bone_density_tscore'],
    intervalMonths: 24,
    outOfRangeIntervalMonths: 12,
    wellnessCore: true,
    note: 'A core longevity metric (body composition and bone density) that no blood test captures - imaging referral or a private scan provider.',
  },
  {
    key: 'cystatin_c',
    label: 'Cystatin C',
    category: 'private',
    markerKeys: ['cystatin_c'],
    intervalMonths: 12,
    wellnessCore: false,
    showIf: 'creatineSupplement',
    note: "You've flagged creatine supplementation, which raises creatinine independent of kidney function. Cystatin C gives an alternative kidney-function reading that creatine doesn't affect - not a routine GP test, usually a self-funded add-on.",
  },
  {
    key: 'vo2_max_test',
    label: 'VO2 Max Test',
    category: 'private',
    markerKeys: ['vo2_max'],
    intervalMonths: 12,
    wellnessCore: true,
    note: 'One of the strongest single predictors of longevity - exercise physiologist or sports-science lab test.',
  },
]
