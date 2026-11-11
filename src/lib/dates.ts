/** Parses "dd/mm/yy" or "dd/mm/yyyy" (as printed on Australian pathology reports) to ISO yyyy-mm-dd. */
export function ausDateToIso(input: string): string | null {
  const m = input.trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{2}|\d{4})$/)
  if (!m) return null
  const day = Number(m[1])
  const month = Number(m[2])
  let year = Number(m[3])
  if (year < 100) year += year >= 70 ? 1900 : 2000
  if (month < 1 || month > 12 || day < 1 || day > 31) return null
  const iso = `${year.toString().padStart(4, '0')}-${month.toString().padStart(2, '0')}-${day.toString().padStart(2, '0')}`
  return iso
}

export function formatIsoDate(iso: string): string {
  const d = new Date(iso + 'T00:00:00')
  if (Number.isNaN(d.getTime())) return iso
  return d.toLocaleDateString('en-AU', { day: '2-digit', month: 'short', year: 'numeric' })
}

export function todayIso(): string {
  return new Date().toISOString().slice(0, 10)
}

/** Adds a (possibly negative) number of whole months to an ISO date, clamping the day if the target month is shorter. */
export function addMonthsIso(iso: string, months: number): string {
  const d = new Date(iso + 'T00:00:00')
  const day = d.getDate()
  d.setDate(1)
  d.setMonth(d.getMonth() + months)
  const daysInTargetMonth = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate()
  d.setDate(Math.min(day, daysInTargetMonth))
  return d.toISOString().slice(0, 10)
}

/** Whole days from `a` to `b` (positive if `b` is after `a`). */
export function daysBetweenIso(a: string, b: string): number {
  const da = new Date(a + 'T00:00:00')
  const db = new Date(b + 'T00:00:00')
  return Math.round((db.getTime() - da.getTime()) / (1000 * 60 * 60 * 24))
}

export function ageInYears(birthIso: string, atIso: string): number {
  const birth = new Date(birthIso + 'T00:00:00')
  const at = new Date(atIso + 'T00:00:00')
  let age = at.getFullYear() - birth.getFullYear()
  const monthDiff = at.getMonth() - birth.getMonth()
  if (monthDiff < 0 || (monthDiff === 0 && at.getDate() < birth.getDate())) age -= 1
  return age
}

const MONTHS: Record<string, number> = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12 }
const MON = '(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\\.?'

function buildIso(year: number, month: number, day: number): string | null {
  if (year < 100) year += year >= 70 ? 1900 : 2000
  if (month < 1 || month > 12 || day < 1 || day > 31) return null
  return `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
}

export interface FoundDate {
  iso: string
  /** Character offset of the match in the searched text. */
  index: number
  length: number
}

/**
 * Finds every date in a piece of text, in any common report format: 10/11/26, 10/11/2026,
 * 10 Nov 26, 10 November 2026, Nov 10, 2026, 2026-11-10. Numeric dates are day-first
 * (Australian). Returned in order of appearance.
 */
export function findDatesInText(text: string): FoundDate[] {
  const found: FoundDate[] = []
  const taken = (idx: number, len: number) => found.some((f) => idx < f.index + f.length && f.index < idx + len)
  const add = (m: RegExpMatchArray, iso: string | null) => {
    if (iso && m.index !== undefined && !taken(m.index, m[0].length)) found.push({ iso, index: m.index, length: m[0].length })
  }
  for (const m of text.matchAll(/\b(\d{4})-(\d{2})-(\d{2})\b/g)) add(m, buildIso(+m[1], +m[2], +m[3]))
  for (const m of text.matchAll(new RegExp(`\\b(\\d{1,2})(?:st|nd|rd|th)?[\\s-]+${MON}[\\s,-]+(\\d{4}|\\d{2})\\b`, 'gi')))
    add(m, buildIso(+m[3], MONTHS[m[2].toLowerCase()], +m[1]))
  for (const m of text.matchAll(new RegExp(`\\b${MON}\\s+(\\d{1,2})(?:st|nd|rd|th)?,?\\s+(\\d{4})\\b`, 'gi')))
    add(m, buildIso(+m[3], MONTHS[m[1].toLowerCase()], +m[2]))
  for (const m of text.matchAll(/\b(\d{1,2})\/(\d{1,2})\/(\d{4}|\d{2})\b/g)) add(m, buildIso(+m[3], +m[2], +m[1]))
  return found.sort((a, b) => a.index - b.index)
}
