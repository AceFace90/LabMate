import Foundation

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
nonisolated enum KidneyFunction {
    private static let mgDlToUmolL = 88.42

    static func cystatinCEgfr(_ cystatinC: Double, age: Int, sex: Sex) -> Double {
        let ratio = cystatinC / 0.8
        let exponent = ratio <= 1 ? -0.499 : -1.328
        let sexMultiplier = sex == .F ? 0.932 : 1.0
        return 133 * pow(ratio, exponent) * pow(0.996, Double(age)) * sexMultiplier
    }

    private static func ckdEpiCreatinineOnlyEgfr(_ creatinineMgDl: Double, age: Int, sex: Sex) -> Double {
        let kappa = sex == .F ? 0.7 : 0.9
        let alpha = sex == .F ? -0.241 : -0.302
        let ratio = creatinineMgDl / kappa
        let sexMultiplier = sex == .F ? 1.012 : 1.0
        return 142 * pow(min(ratio, 1), alpha) * pow(max(ratio, 1), -1.2) * pow(0.9938, Double(age)) * sexMultiplier
    }

    /**
     * Solves the creatinine-only eGFR equation backwards: given a target eGFR (from Cystatin
     * C) and age/sex, what serum creatinine would produce that same eGFR? The equation is
     * monotonically decreasing in creatinine, so binary search finds the unique answer without
     * needing separate algebra for each piecewise branch.
     */
    private static func invertCreatinineFromEgfr(_ targetEgfr: Double, age: Int, sex: Sex) -> Double {
        var low = 0.1
        var high = 15.0
        for _ in 0..<60 {
            let mid = (low + high) / 2
            let egfrAtMid = ckdEpiCreatinineOnlyEgfr(mid, age: age, sex: sex)
            // eGFR falls as creatinine rises, so narrow toward the half that brackets the target.
            if egfrAtMid > targetEgfr { low = mid } else { high = mid }
        }
        return (low + high) / 2
    }

    /**
     * The "normalised" creatinine (in umol/L) that this person's age/sex would be expected to
     * produce at their Cystatin-C-based eGFR - i.e. what their creatinine would likely read if
     * it reflected only kidney filtration, not the extra creatinine load from supplementation.
     */
    static func normalisedCreatinineFromCystatinC(_ cystatinC: Double, age: Int, sex: Sex) -> Double {
        let egfr = cystatinCEgfr(cystatinC, age: age, sex: sex)
        return invertCreatinineFromEgfr(egfr, age: age, sex: sex) * mgDlToUmolL
    }
}
