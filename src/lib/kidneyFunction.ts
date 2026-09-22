/**
 * Kidney-function helpers used to build a creatine-supplement-adjusted biological age:
 *
 * 1. Estimate eGFR from Cystatin C - doesn't depend on creatinine, so it isn't affected
 *    by creatine supplementation the way the standard creatinine-based eGFR is.
 * 2. Invert the standard creatinine-based CKD-EPI 2021 equation to ask "what creatinine
 *    would this person's age/sex normally produce at that eGFR?" - a "normalised"
 *    creatinine reflecting actual kidney function rather than muscle/creatine load.
 * 3. Feed that normalised creatinine into PhenoAge instead of the real (creatine-elevated)
 *    reading, to get a creatine-adjusted biological age shown alongside (never replacing)
 *    the real estimate.
 *
 * Step 2 is exact algebra (a single equation solved backwards, no extra error introduced
 * by the inversion itself) - the estimate error here is entirely in step 1, the same order
 * of error any cystatin-C-based eGFR carries.
 *
 * Step 1 coefficients verified against kidney.org/professionals/ckd-epi-cystatin-c-equation-2012
 * (NKF's page for the CKD-EPI 2012 Cystatin C equation): intercept 133, exponents -0.499
 * (Scys/0.8 <= 1) / -1.328 (> 1), age decay 0.996^Age, female multiplier 0.932.
 *
 * Step 2/3 use the 2021 CKD-EPI creatinine-only equation (Inker et al., NEJM 2021,
 * race-free version), verified against the published paper (Table 2) in this session:
 * eGFR = 142 x min(Scr/k,1)^a x max(Scr/k,1)^-1.200 x 0.9938^Age x (1.012 if female)
 * k = 0.7 (female) / 0.9 (male), a = -0.241 (female) / -0.302 (male). Scr in mg/dL.
 */

const MG_DL_TO_UMOL_L = 88.42

export function cystatinCEgfr(cystatinC: number, age: number, sex: 'M' | 'F'): number {
  const ratio = cystatinC / 0.8
  const exponent = ratio <= 1 ? -0.499 : -1.328
  const sexMultiplier = sex === 'F' ? 0.932 : 1
  return 133 * Math.pow(ratio, exponent) * Math.pow(0.996, age) * sexMultiplier
}

function ckdEpiCreatinineOnlyEgfr(creatinineMgDl: number, age: number, sex: 'M' | 'F'): number {
  const kappa = sex === 'F' ? 0.7 : 0.9
  const alpha = sex === 'F' ? -0.241 : -0.302
  const ratio = creatinineMgDl / kappa
  const sexMultiplier = sex === 'F' ? 1.012 : 1
  return 142 * Math.pow(Math.min(ratio, 1), alpha) * Math.pow(Math.max(ratio, 1), -1.2) * Math.pow(0.9938, age) * sexMultiplier
}

/**
 * Solves the creatinine-only eGFR equation backwards: given a target eGFR (from Cystatin
 * C) and age/sex, what serum creatinine would produce that same eGFR? The equation is
 * monotonically decreasing in creatinine, so binary search finds the unique answer without
 * needing separate algebra for each piecewise branch.
 */
function invertCreatinineFromEgfr(targetEgfr: number, age: number, sex: 'M' | 'F'): number {
  let low = 0.1
  let high = 15
  for (let i = 0; i < 60; i++) {
    const mid = (low + high) / 2
    const egfrAtMid = ckdEpiCreatinineOnlyEgfr(mid, age, sex)
    // eGFR falls as creatinine rises, so narrow toward the half that brackets the target.
    if (egfrAtMid > targetEgfr) low = mid
    else high = mid
  }
  return (low + high) / 2
}

/**
 * The "normalised" creatinine (in umol/L) that this person's age/sex would be expected to
 * produce at their Cystatin-C-based eGFR - i.e. what their creatinine would likely read if
 * it reflected only kidney filtration, not the extra creatinine load from supplementation.
 */
export function normalisedCreatinineFromCystatinC(cystatinC: number, age: number, sex: 'M' | 'F'): number {
  const egfr = cystatinCEgfr(cystatinC, age, sex)
  return invertCreatinineFromEgfr(egfr, age, sex) * MG_DL_TO_UMOL_L
}
