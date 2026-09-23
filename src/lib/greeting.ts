/** Same thresholds as GymMate/MacroMate, for a consistent greeting across all three apps. */
export function timeOfDayGreeting(hour: number = new Date().getHours()): string {
  if (hour < 12) return 'Good morning'
  if (hour < 18) return 'Good afternoon'
  return 'Good evening'
}

export function firstNameOf(name: string | null | undefined, fallback: string | null | undefined): string {
  const source = name || fallback || 'there'
  return source.trim().split(' ')[0]
}
