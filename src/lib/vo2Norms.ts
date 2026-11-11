/**
 * VO2 max reference values: 10th percentile by age band and sex, treadmill CPET, mL/kg/min.
 * Source: Kaminsky LA et al. (2022). Updated Reference Standards for Cardiorespiratory Fitness
 * Measured with Cardiopulmonary Exercise Testing. Mayo Clin Proc 97(2):285-293 (as tabulated at
 * https://en.wikipedia.org/wiki/VO2_max). Below the 10th percentile reads as "low".
 * Age bands: 20-29, 30-39, 40-49, 50-59, 60-69, 70-79, 80-89 (ages outside are clamped).
 */
const P10: Record<'M' | 'F', number[]> = {
  M: [28.6, 24.9, 22.1, 18.6, 15.8, 13.6, 12.9],
  F: [22.5, 18.6, 17.2, 16.5, 13.4, 12.3, 11.4],
}

export function vo2LowBound(age: number, sex: 'M' | 'F'): number {
  const band = Math.min(6, Math.max(0, Math.floor(age / 10) - 2))
  return P10[sex][band]
}
