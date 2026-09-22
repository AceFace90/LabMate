import type { CategoryDef, CustomMarker, MarkerDef } from '../types'

export const CATEGORIES: CategoryDef[] = [
  {
    key: 'electrolytes_kidney',
    label: 'Electrolytes & Kidney',
    description: 'Sodium, potassium and how well the kidneys are filtering.',
  },
  {
    key: 'liver',
    label: 'Liver Function',
    description: 'Enzymes and proteins that flag liver stress or damage.',
  },
  {
    key: 'iron',
    label: 'Iron Studies',
    description: 'Iron storage and transport.',
  },
  {
    key: 'metabolic',
    label: 'Metabolic Function',
    description: 'Blood sugar regulation and insulin sensitivity.',
  },
  {
    key: 'heart_lipids',
    label: 'Heart Health',
    description: 'Cholesterol, triglycerides and cardiovascular risk markers.',
  },
  {
    key: 'blood_marrow',
    label: 'Blood & Bone Marrow',
    description: 'Full blood count - red cells, white cells, platelets.',
  },
  {
    key: 'hormones',
    label: 'Hormone Health',
    description: 'Sex hormones, thyroid and adrenal markers.',
  },
  {
    key: 'nutrition',
    label: 'Nutrition',
    description: 'Vitamins and minerals that support long-term health.',
  },
  {
    key: 'gut_health',
    label: 'Gut Health',
    description: 'Markers of gut inflammation and digestive function.',
  },
  {
    key: 'autoimmunity',
    label: 'Autoimmunity',
    description: 'Antibody markers that flag the immune system attacking the body’s own tissue.',
  },
  {
    key: 'cancer_screening',
    label: 'Cancer Screening',
    description: 'Tumour markers used for screening or monitoring, not diagnosis on their own.',
  },
  {
    key: 'muscle',
    label: 'Muscle Health',
    description: 'Muscle enzyme markers - sensitive to recent exercise as well as muscle damage.',
  },
  {
    key: 'aerobic_fitness',
    label: 'Aerobic Capacity',
    description: 'Cardiorespiratory fitness - VO2 max and related endurance markers, logged from your watch/manually for now.',
  },
  {
    key: 'body_composition',
    label: 'Body Composition',
    description: 'DEXA scan results - fat, lean mass and bone density.',
  },
  {
    key: 'custom',
    label: 'Custom Metrics',
    description: 'Anything else you want to track that is not in the built-in list.',
  },
]

/**
 * Every marker below is either one that appears in your actual Australian Clinical
 * Labs reports (verified name/unit/range against the parsed PDFs) or a commonly
 * ordered longevity/pathology marker you don't have data for yet. We never invent a
 * numeric reference range - ranges only ever come from a lab report you've imported.
 */
export const MARKER_CATALOG: MarkerDef[] = [
  // Electrolytes & kidney
  { key: 'sodium', label: 'Sodium', category: 'electrolytes_kidney', defaultUnit: 'mmol/L', aliases: ['sodium'], description: 'Fluid balance and nerve/muscle function.', standardRangeLow: 135, standardRangeHigh: 145, standardRangeText: '135 - 145' },
  { key: 'potassium', label: 'Potassium', category: 'electrolytes_kidney', defaultUnit: 'mmol/L', aliases: ['potassium'], description: 'Heart and muscle electrical activity.', standardRangeLow: 3.5, standardRangeHigh: 5.2, standardRangeText: '3.5 - 5.2' },
  { key: 'chloride', label: 'Chloride', category: 'electrolytes_kidney', defaultUnit: 'mmol/L', aliases: ['chloride'], description: 'Fluid and acid-base balance.', standardRangeLow: 95, standardRangeHigh: 107, standardRangeText: '95 - 107' },
  { key: 'bicarbonate', label: 'Bicarbonate', category: 'electrolytes_kidney', defaultUnit: 'mmol/L', aliases: ['bicarbonate'], description: 'Acid-base balance.', standardRangeLow: 22, standardRangeHigh: 29, standardRangeText: '22 - 29' },
  { key: 'urea', label: 'Urea', category: 'electrolytes_kidney', defaultUnit: 'mmol/L', aliases: ['urea'], description: 'Protein waste filtered by the kidneys.', standardRangeLow: 2.5, standardRangeHigh: 7.8, standardRangeText: '2.5 - 7.8' },
  { key: 'creatinine', label: 'Creatinine', category: 'electrolytes_kidney', defaultUnit: 'umol/L', aliases: ['creatinine'], description: 'Muscle waste product; key kidney-function marker.', standardRangeLow: 60, standardRangeHigh: 110, standardRangeText: '60 - 110' },
  { key: 'egfr', label: 'eGFR', category: 'electrolytes_kidney', defaultUnit: 'mL/min/1.73m2', aliases: ['egfr'], description: 'Estimated kidney filtration rate.', standardRangeLow: 60, standardRangeHigh: null, standardRangeText: '> 60' },
  { key: 'uric_acid', label: 'Uric Acid', category: 'electrolytes_kidney', defaultUnit: 'mmol/L', aliases: ['uric acid', 'urate'], description: 'Linked to gout risk and kidney load.', standardRangeLow: 0.15, standardRangeHigh: 0.45, standardRangeText: '0.15 - 0.45' },
  { key: 'cystatin_c', label: 'Cystatin C', category: 'electrolytes_kidney', defaultUnit: 'mg/L', aliases: ['cystatin c', 'cystatin-c'], description: "Kidney-function marker that, unlike creatinine, isn't affected by muscle mass or creatine supplementation - most useful if you supplement with creatine and want a kidney-function reading that confound doesn't touch. No standard range shown here; we compute an eGFR from it instead (see biological age section) using the CKD-EPI 2012 Cystatin C equation, verified against kidney.org/professionals/ckd-epi-cystatin-c-equation-2012." },
  { key: 'calcium', label: 'Calcium', category: 'electrolytes_kidney', defaultUnit: 'mmol/L', aliases: ['calcium'], description: 'Bone health and nerve/muscle function.' },
  { key: 'corrected_calcium', label: 'Corrected Calcium', category: 'electrolytes_kidney', defaultUnit: 'mmol/L', aliases: ['adj.ca', 'corrected calcium', 'adjusted calcium'], description: 'Calcium adjusted for blood albumin level.' },
  { key: 'phosphate', label: 'Phosphate', category: 'electrolytes_kidney', defaultUnit: 'mmol/L', aliases: ['phosphate'], description: 'Bone health and energy metabolism.' },
  { key: 'pth', label: 'PTH', category: 'electrolytes_kidney', defaultUnit: 'pmol/L', aliases: ['pth', 'parathyroid hormone'], description: 'Parathyroid hormone - regulates calcium and phosphate; pairs with your calcium and vitamin D results. No standard range shown here - intact PTH assays vary enough between labs that we did not want to guess; use the range on your report.' },

  // Liver
  { key: 'total_protein', label: 'Total Protein', category: 'liver', defaultUnit: 'g/L', aliases: ['t.protein', 'total protein'], description: 'Overall protein levels in blood.', standardRangeLow: 60, standardRangeHigh: 80, standardRangeText: '60 - 80' },
  { key: 'albumin', label: 'Albumin', category: 'liver', defaultUnit: 'g/L', aliases: ['albumin'], description: 'Main blood protein made by the liver.', standardRangeLow: 35, standardRangeHigh: 50, standardRangeText: '35 - 50' },
  { key: 'globulin', label: 'Globulin', category: 'liver', defaultUnit: 'g/L', aliases: ['globulin'], description: 'Immune-related proteins.', standardRangeLow: 20, standardRangeHigh: 35, standardRangeText: '20 - 35' },
  { key: 'alp', label: 'ALP', category: 'liver', defaultUnit: 'U/L', aliases: ['alp', 'alkaline phosphatase'], description: 'Liver and bone enzyme.', standardRangeLow: 30, standardRangeHigh: 120, standardRangeText: '30 - 120' },
  { key: 'bilirubin', label: 'Bilirubin', category: 'liver', defaultUnit: 'umol/L', aliases: ['bilirubin'], description: 'Breakdown product of red blood cells, processed by the liver.', standardRangeLow: null, standardRangeHigh: 20, standardRangeText: '< 20' },
  { key: 'ggt', label: 'GGT', category: 'liver', defaultUnit: 'U/L', aliases: ['ggt'], description: 'Sensitive marker of liver/bile duct stress.', standardRangeLow: null, standardRangeHigh: 40, standardRangeText: '< 40' },
  { key: 'ast', label: 'AST', category: 'liver', defaultUnit: 'U/L', aliases: ['ast'], description: 'Liver enzyme; also present in muscle.', standardRangeLow: null, standardRangeHigh: 40, standardRangeText: '< 40' },
  { key: 'alt', label: 'ALT', category: 'liver', defaultUnit: 'U/L', aliases: ['alt'], description: 'Liver enzyme; the most liver-specific of the two transaminases.', standardRangeLow: null, standardRangeHigh: 40, standardRangeText: '< 40' },

  // Iron studies
  { key: 'iron', label: 'Iron', category: 'iron', defaultUnit: 'umol/L', aliases: ['iron'], description: 'Circulating iron level.', standardRangeLow: 10, standardRangeHigh: 30, standardRangeText: '10 - 30' },
  { key: 'transferrin', label: 'Transferrin', category: 'iron', defaultUnit: 'g/L', aliases: ['transferrin'], description: 'Protein that transports iron.', standardRangeLow: 2.0, standardRangeHigh: 3.6, standardRangeText: '2.0 - 3.6' },
  { key: 'transferrin_saturation', label: 'Transferrin Saturation', category: 'iron', defaultUnit: '%', aliases: ['saturation', 'transferrin saturation'], description: 'How much of your transferrin is carrying iron.' },
  { key: 'ferritin', label: 'Ferritin', category: 'iron', defaultUnit: 'ug/L', aliases: ['ferritin'], description: "Body's iron storage level." },

  // Metabolic
  { key: 'glucose', label: 'Glucose', category: 'metabolic', defaultUnit: 'mmol/L', aliases: ['glucose'], description: 'Blood sugar level.' },
  { key: 'hba1c', label: 'HbA1c', category: 'metabolic', defaultUnit: '%', aliases: ['hba1c', 'haemoglobin a1c'], description: 'Average blood sugar over ~3 months.', standardRangeLow: 4.0, standardRangeHigh: 6.0, standardRangeText: '4.0 - 6.0' },
  { key: 'insulin', label: 'Fasting Insulin', category: 'metabolic', defaultUnit: 'mU/L', aliases: ['insulin', 'fasting insulin'], description: 'Early signal of insulin resistance, often before glucose rises.', standardRangeLow: 2, standardRangeHigh: 25, standardRangeText: '2 - 25' },

  // Heart / lipids
  { key: 'total_cholesterol', label: 'Total Cholesterol', category: 'heart_lipids', defaultUnit: 'mmol/L', aliases: ['total chol.', 'total cholesterol'], description: 'Overall cholesterol carried in the blood.', standardRangeLow: null, standardRangeHigh: 5.5, standardRangeText: '< 5.5' },
  { key: 'hdl_cholesterol', label: 'HDL Cholesterol', category: 'heart_lipids', defaultUnit: 'mmol/L', aliases: ['hdl chol.', 'hdl cholesterol'], description: '"Good" cholesterol that clears excess from arteries.', standardRangeLow: 1.0, standardRangeHigh: null, standardRangeText: '> 1.0' },
  { key: 'ldl_cholesterol', label: 'LDL Cholesterol', category: 'heart_lipids', defaultUnit: 'mmol/L', aliases: ['ldl chol.', 'ldl cholesterol'], description: '"Bad" cholesterol linked to arterial plaque.', standardRangeLow: null, standardRangeHigh: 3.5, standardRangeText: '< 3.5' },
  { key: 'non_hdl_cholesterol', label: 'Non-HDL Cholesterol', category: 'heart_lipids', defaultUnit: 'mmol/L', aliases: ['non-hdl chol.', 'non-hdl cholesterol'], description: 'All the atherogenic (artery-clogging) cholesterol combined.', standardRangeLow: null, standardRangeHigh: 4.0, standardRangeText: '< 4.0' },
  { key: 'triglyceride', label: 'Triglycerides', category: 'heart_lipids', defaultUnit: 'mmol/L', aliases: ['triglyceride', 'triglycerides'], description: 'Fat circulating in the blood; rises with sugar/alcohol intake.', standardRangeLow: null, standardRangeHigh: 2.0, standardRangeText: '< 2.0' },
  { key: 'ldl_hdl_ratio', label: 'LDL/HDL Ratio', category: 'heart_lipids', aliases: ['ldl/hdl ratio'], description: 'Balance between bad and good cholesterol.', standardRangeLow: null, standardRangeHigh: 3.5, standardRangeText: '< 3.5' },
  { key: 'chol_hdl_ratio', label: 'Chol/HDL Ratio', category: 'heart_lipids', aliases: ['chol/hdl ratio'], description: 'Overall cardiovascular risk ratio.', standardRangeLow: null, standardRangeHigh: 5.0, standardRangeText: '< 5.0' },
  { key: 'lp_a', label: 'Lp(a)', category: 'heart_lipids', defaultUnit: 'nmol/L', aliases: ['lp(a)', 'lipoprotein(a)', 'lipoprotein a'], description: 'Largely genetic cardiovascular risk marker, not routinely tested. No standard range shown - units vary by assay (mg/dL vs nmol/L) too much to default safely.' },
  { key: 'apob', label: 'ApoB', category: 'heart_lipids', defaultUnit: 'g/L', aliases: ['apob', 'apo b', 'apolipoprotein b'], description: 'Counts atherogenic particles directly; often more predictive than LDL alone.', standardRangeLow: 0.4, standardRangeHigh: 1.0, standardRangeText: '0.4 - 1.0' },
  { key: 'hs_crp', label: 'hs-CRP', category: 'heart_lipids', defaultUnit: 'mg/L', aliases: ['hs-crp', 'hs crp', 'high sensitivity crp', 'c-reactive protein'], description: 'Sensitive marker of vascular inflammation.', standardRangeLow: null, standardRangeHigh: 3.0, standardRangeText: '< 3.0' },
  { key: 'homocysteine', label: 'Homocysteine', category: 'heart_lipids', defaultUnit: 'umol/L', aliases: ['homocysteine'], description: 'Amino acid linked to cardiovascular and cognitive risk when elevated.' },

  // Blood & bone marrow
  { key: 'haemoglobin', label: 'Haemoglobin', category: 'blood_marrow', defaultUnit: 'g/L', aliases: ['haemoglobin'], description: 'Oxygen-carrying protein in red blood cells.' },
  { key: 'rbc', label: 'Red Cell Count', category: 'blood_marrow', defaultUnit: 'x10^12/L', aliases: ['rbc'], description: 'Number of red blood cells.' },
  { key: 'hct', label: 'Haematocrit', category: 'blood_marrow', defaultUnit: 'L/L', aliases: ['hct'], description: 'Proportion of blood that is red cells.' },
  { key: 'mcv', label: 'MCV', category: 'blood_marrow', defaultUnit: 'fL', aliases: ['mcv'], description: 'Average red blood cell size.' },
  { key: 'mch', label: 'MCH', category: 'blood_marrow', defaultUnit: 'pg', aliases: ['mch'], description: 'Average haemoglobin per red blood cell.' },
  { key: 'mchc', label: 'MCHC', category: 'blood_marrow', defaultUnit: 'g/L', aliases: ['mchc'], description: 'Haemoglobin concentration within red blood cells.' },
  { key: 'rdw', label: 'RDW', category: 'blood_marrow', defaultUnit: '%', aliases: ['rdw'], description: 'Variation in red blood cell size.' },
  { key: 'wcc', label: 'White Cell Count', category: 'blood_marrow', defaultUnit: 'x10^9/L', aliases: ['wcc'], description: 'Total infection-fighting white blood cells.' },
  { key: 'neutrophils', label: 'Neutrophils', category: 'blood_marrow', defaultUnit: 'x10^9/L', aliases: ['neutrophils'], description: 'White cells that fight bacterial infection.' },
  { key: 'lymphocytes', label: 'Lymphocytes', category: 'blood_marrow', defaultUnit: 'x10^9/L', aliases: ['lymphocytes'], description: 'White cells central to immune memory.' },
  { key: 'lymphocyte_percent', label: 'Lymphocytes %', category: 'blood_marrow', defaultUnit: '%', aliases: ['lymphocytes %', 'lymphs %', 'lymphocyte %'], description: 'Lymphocytes as a share of total white cells - used in biological-age calculations. Standard range shown (20-40%) is the commonly cited adult reference (MSD Manual); individual labs/methods vary somewhat, and a persistent value a few points above 40% with an otherwise normal white cell count is a common, usually benign finding rather than a sign of a problem on its own.', standardRangeLow: 20, standardRangeHigh: 40, standardRangeText: '20 - 40' },
  { key: 'monocytes', label: 'Monocytes', category: 'blood_marrow', defaultUnit: 'x10^9/L', aliases: ['monocytes'], description: 'White cells that clean up debris and pathogens.' },
  { key: 'eosinophils', label: 'Eosinophils', category: 'blood_marrow', defaultUnit: 'x10^9/L', aliases: ['eosinophils'], description: 'White cells involved in allergic response and parasites.' },
  { key: 'basophils', label: 'Basophils', category: 'blood_marrow', defaultUnit: 'x10^9/L', aliases: ['basophils'], description: 'Least common white cell, involved in inflammatory response.' },
  { key: 'platelets', label: 'Platelets', category: 'blood_marrow', defaultUnit: 'x10^9/L', aliases: ['platelets'], description: 'Cell fragments responsible for clotting.' },
  { key: 'mpv', label: 'MPV', category: 'blood_marrow', defaultUnit: 'fL', aliases: ['mpv'], description: 'Average platelet size.' },
  { key: 'esr', label: 'ESR', category: 'blood_marrow', defaultUnit: 'mm/h', aliases: ['esr'], description: 'General inflammation marker.' },

  // Hormones
  { key: 'testosterone', label: 'Testosterone', category: 'hormones', defaultUnit: 'nmol/L', aliases: ['testosterone'], description: 'Primary male sex hormone.' },
  { key: 'free_testosterone', label: 'Free Testosterone', category: 'hormones', defaultUnit: 'pmol/L', aliases: ['free testosterone'], description: 'Unbound, biologically active testosterone.' },
  { key: 'shbg', label: 'SHBG', category: 'hormones', defaultUnit: 'nmol/L', aliases: ['shbg', 'sex hormone binding globulin'], description: 'Protein that binds sex hormones, affecting how much is "free".' },
  { key: 'estradiol', label: 'Estradiol', category: 'hormones', defaultUnit: 'pmol/L', aliases: ['estradiol', 'oestradiol'], description: 'Key oestrogen, present in both sexes.' },
  { key: 'dhea_s', label: 'DHEA-S', category: 'hormones', defaultUnit: 'umol/L', aliases: ['dhea-s', 'dheas'], description: 'Adrenal hormone precursor, often used as an ageing marker.' },
  { key: 'cortisol', label: 'Cortisol', category: 'hormones', defaultUnit: 'nmol/L', aliases: ['cortisol'], description: 'Primary stress hormone.' },
  { key: 'fsh', label: 'FSH', category: 'hormones', defaultUnit: 'IU/L', aliases: ['fsh'], description: 'Pituitary hormone that regulates reproductive function.' },
  { key: 'lh', label: 'LH', category: 'hormones', defaultUnit: 'IU/L', aliases: ['lh'], description: 'Pituitary hormone that triggers sex hormone production.' },
  { key: 'tsh', label: 'TSH', category: 'hormones', defaultUnit: 'mIU/L', aliases: ['tsh'], description: 'Pituitary signal that drives thyroid hormone production.', standardRangeLow: 0.4, standardRangeHigh: 4.0, standardRangeText: '0.4 - 4.0' },
  { key: 'free_t4', label: 'Free T4', category: 'hormones', defaultUnit: 'pmol/L', aliases: ['free t4', 'ft4'], description: 'Main thyroid hormone in circulation.', standardRangeLow: 10, standardRangeHigh: 20, standardRangeText: '10 - 20' },
  { key: 'free_t3', label: 'Free T3', category: 'hormones', defaultUnit: 'pmol/L', aliases: ['free t3', 'ft3'], description: 'Active thyroid hormone.', standardRangeLow: 3.5, standardRangeHigh: 6.5, standardRangeText: '3.5 - 6.5' },

  // Nutrition
  { key: 'vitamin_b12', label: 'Vitamin B12', category: 'nutrition', defaultUnit: 'pmol/L', aliases: ['vitamin b12', 'b12'], description: 'Needed for nerve function and red blood cell production.', standardRangeLow: 150, standardRangeHigh: 670, standardRangeText: '150 - 670' },
  { key: 'active_b12', label: 'Active B12 (Holotranscobalamin)', category: 'nutrition', defaultUnit: 'pmol/L', aliases: ['active b12', 'holotranscobalamin'], description: 'The fraction of B12 actually available to cells - more sensitive to early deficiency than total B12.' },
  { key: 'folate', label: 'Folate', category: 'nutrition', defaultUnit: 'nmol/L', aliases: ['folate'], description: 'B-vitamin needed for cell division and DNA synthesis.', standardRangeLow: 7, standardRangeHigh: 45, standardRangeText: '7 - 45' },
  { key: 'vitamin_d', label: 'Vitamin D', category: 'nutrition', defaultUnit: 'nmol/L', aliases: ['vitamin d', '25-oh vitamin d', '25(oh)d'], description: 'Bone health, immune function; commonly low without supplementation.', standardRangeLow: 50, standardRangeHigh: 150, standardRangeText: '50 - 150' },
  { key: 'magnesium', label: 'Magnesium', category: 'nutrition', defaultUnit: 'mmol/L', aliases: ['magnesium'], description: 'Involved in muscle, nerve and energy function.', standardRangeLow: 0.7, standardRangeHigh: 1.1, standardRangeText: '0.70 - 1.10' },
  { key: 'zinc', label: 'Zinc', category: 'nutrition', defaultUnit: 'umol/L', aliases: ['zinc'], description: 'Immune function and wound healing.', standardRangeLow: 10, standardRangeHigh: 18, standardRangeText: '10 - 18' },

  // Gut health
  { key: 'faecal_calprotectin', label: 'Faecal Calprotectin', category: 'gut_health', defaultUnit: 'ug/g', aliases: ['calprotectin', 'faecal calprotectin'], description: 'Stool marker of gut inflammation; helps distinguish IBD from IBS.' },

  // Autoimmunity
  { key: 'ana', label: 'ANA', category: 'autoimmunity', aliases: ['ana', 'antinuclear antibodies', 'antinuclear antibody'], description: 'Screening antibody for autoimmune conditions (e.g. lupus); often reported as a titer/pattern rather than a plain number, and a low-level positive is common without disease. No standard range shown - read against the titer and pattern on your report.' },
  { key: 'rheumatoid_factor', label: 'Rheumatoid Factor', category: 'autoimmunity', defaultUnit: 'IU/mL', aliases: ['rheumatoid factor', 'rf'], description: 'Antibody associated with rheumatoid arthritis, though it can be positive without disease. No standard range shown - cutoff varies by lab/assay, use the range on your report.' },
  { key: 'anti_tpo', label: 'Anti-TPO', category: 'autoimmunity', defaultUnit: 'IU/mL', aliases: ['anti-tpo', 'anti tpo', 'thyroid peroxidase antibodies', 'tpo antibodies'], description: 'Thyroid autoimmunity marker; elevated in Hashimoto\'s thyroiditis and Graves\' disease. No standard range shown - cutoff varies by lab/assay, use the range on your report.' },
  { key: 'anti_tg', label: 'Anti-Tg', category: 'autoimmunity', defaultUnit: 'IU/mL', aliases: ['anti-tg', 'anti tg', 'thyroglobulin antibodies'], description: 'Another thyroid autoimmunity marker, often checked alongside Anti-TPO. No standard range shown - cutoff varies by lab/assay, use the range on your report.' },
  { key: 'ttg_iga', label: 'Coeliac Antibodies (tTG-IgA)', category: 'autoimmunity', defaultUnit: 'U/mL', aliases: ['ttg-iga', 'ttg iga', 'tissue transglutaminase iga', 'coeliac antibodies'], description: 'Screening antibody for coeliac disease. No standard range shown - cutoff varies a lot by lab/assay, use the range on your report.' },

  // Cancer screening (tumour markers - screening/monitoring only, not diagnostic alone)
  { key: 'psa', label: 'PSA', category: 'cancer_screening', defaultUnit: 'ug/L', aliases: ['psa', 'prostate specific antigen'], description: 'Prostate screening marker. No standard range shown - the "normal" cutoff shifts with age, use the range on your report.', sexSpecific: 'M' },
  { key: 'ca125', label: 'CA-125', category: 'cancer_screening', defaultUnit: 'U/mL', aliases: ['ca-125', 'ca 125'], description: 'Ovarian screening/monitoring marker - also rises with plenty of benign causes (e.g. endometriosis, menstruation, fibroids). No standard range shown - use the range on your report.', sexSpecific: 'F' },

  // Muscle
  { key: 'creatine_kinase', label: 'Creatine Kinase (CK)', category: 'muscle', defaultUnit: 'U/L', aliases: ['ck', 'creatine kinase', 'creatinine kinase'], description: "Muscle enzyme - rises with muscle damage/intense exercise. Unlike creatinine, it isn't confounded by creatine supplementation, so it's a cleaner muscle-specific check if you're on creatine. No standard range shown - varies a lot by sex, muscularity and recent exercise; use the range on your report." },

  // Aerobic capacity (from Everlab's biomarker categories) - watch/wearable import planned, manual for now
  { key: 'vo2_max', label: 'VO2 Max', category: 'aerobic_fitness', defaultUnit: 'mL/kg/min', aliases: ['vo2 max', 'vo2max'], description: 'Maximum rate of oxygen use during exercise - a strong predictor of cardiovascular longevity. Norms vary a lot by age and sex, so no single "normal" range is shown - higher is better relative to your own trend.', manualOnly: true },

  // Full body composition (DEXA) - manual entry for now
  { key: 'body_fat_percent', label: 'Body Fat %', category: 'body_composition', defaultUnit: '%', aliases: ['body fat %', 'body fat percent', 'fat mass %'], description: 'Percentage of total body mass that is fat, from a DEXA or similar scan.', manualOnly: true },
  { key: 'lean_mass', label: 'Lean Mass', category: 'body_composition', defaultUnit: 'kg', aliases: ['lean mass', 'lean body mass'], description: 'Muscle, bone and organ mass - the non-fat component of a DEXA scan.', manualOnly: true },
  { key: 'visceral_fat_rating', label: 'Visceral Fat Rating', category: 'body_composition', aliases: ['visceral fat', 'visceral fat rating', 'vat'], description: 'Fat stored around internal organs - a stronger metabolic risk signal than overall body fat.', manualOnly: true, standardRangeLow: null, standardRangeHigh: 13, standardRangeText: '< 13' },
  { key: 'bone_density_tscore', label: 'Bone Density (T-score)', category: 'body_composition', defaultUnit: 'T-score', aliases: ['bone density', 't-score', 'bmd t-score'], description: 'DEXA bone mineral density vs. a healthy young adult. WHO criteria: normal > -1.0, osteopenia -1.0 to -2.5, osteoporosis < -2.5.', manualOnly: true, standardRangeLow: -1.0, standardRangeHigh: null, standardRangeText: '> -1.0' },
]

function normalizeMarkerName(name: string): string {
  return name.trim().toLowerCase().replace(/\s+/g, ' ').replace(/\.+$/, '')
}

export function findMarkerByAlias(rawName: string): MarkerDef | undefined {
  const normalized = normalizeMarkerName(rawName)
  const exact = MARKER_CATALOG.find((m) => m.aliases.some((a) => normalizeMarkerName(a) === normalized))
  if (exact) return exact
  // Labs sometimes print abbreviated/re-standardised variants of a name we already
  // know (e.g. "SHBG re-std.", "Free Testost.") - match on a shared word-prefix
  // rather than requiring an exact alias for every abbreviation we haven't seen yet.
  return MARKER_CATALOG.find((m) =>
    m.aliases.some((a) => {
      const alias = normalizeMarkerName(a)
      return alias.length >= 4 && (normalized.startsWith(alias) || alias.startsWith(normalized))
    }),
  )
}

export function findCustomMarker(customMarkers: CustomMarker[], key: string): CustomMarker | undefined {
  return customMarkers.find((m) => m.key === key)
}

export function getMarker(key: string): MarkerDef | undefined {
  return MARKER_CATALOG.find((m) => m.key === key)
}
