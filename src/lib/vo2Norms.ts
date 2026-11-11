/**
 * VO2 max reference standards by age band and sex, mL/kg/min (supplied by the user).
 * Rows are Superior (95th), Excellent (80th), Good (60th), Fair (40th) percentile; below the
 * Fair (40th) value is rated "Poor", and that value is the lower bound used for the range.
 * Age bands: 20-29, 30-39, 40-49, 50-59, 60-69, 70-79 (ages outside are clamped).
 * Keep in sync with vo2Standards in LabMate App/LabMate/LabMate/Logic/HealthScore.swift.
 */
export const VO2_STANDARDS: Record<'M' | 'F', { superior: number[]; excellent: number[]; good: number[]; fair: number[] }> = {
  M: {
    superior: [55.4, 54.0, 52.5, 48.9, 45.7, 42.1],
    excellent: [51.1, 48.3, 46.4, 43.4, 39.5, 36.7],
    good: [45.4, 44.0, 42.4, 39.2, 35.5, 32.3],
    fair: [41.7, 40.5, 38.5, 35.6, 32.3, 29.4],
  },
  F: {
    superior: [49.6, 47.4, 45.3, 41.1, 37.8, 36.7],
    excellent: [43.9, 42.4, 39.7, 36.7, 33.0, 30.9],
    good: [39.5, 37.8, 36.3, 33.0, 30.0, 28.1],
    fair: [36.1, 34.4, 33.0, 30.1, 27.5, 25.9],
  },
}

/** Lower bound of the in-range zone: the Fair (40th percentile) value for this age and sex. */
export function vo2LowBound(age: number, sex: 'M' | 'F'): number {
  const band = Math.min(5, Math.max(0, Math.floor(age / 10) - 2))
  return VO2_STANDARDS[sex].fair[band]
}

/**
 * Body fat % ranges by sex, American Council on Exercise categories (supplied by the user):
 * Essential 10-12 (F) / 2-4 (M), Athletes 14-20 / 6-13, Fitness 21-24 / 14-17,
 * Acceptable 25-31 / 18-25, Obese 32+ (F). The in-range zone is Athletes through Acceptable;
 * below it is the essential-fat zone, above it is obese.
 * Keep in sync with bodyFatBounds in LabMate App/LabMate/LabMate/Logic/HealthScore.swift.
 */
export function bodyFatBounds(sex: 'M' | 'F'): { low: number; high: number } {
  return sex === 'F' ? { low: 14, high: 31 } : { low: 6, high: 25 }
}
