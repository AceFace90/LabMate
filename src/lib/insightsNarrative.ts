import { formatIsoDate } from './dates'
import type { BioAgeContribution, BioAgeResult } from './bioAge'
import type { CategoryCoverage, OverallCoverage } from './healthScore'

/** Port of iOS InsightsNarrative: calm, descriptive copy generated from the data, never advice or diagnosis. */
export const emptyNarrative =
  'Import a pathology report and LabMate will show where your results sit, how much of the picture is filled in, and what is worth a conversation with your doctor.'

export const years = (d: number) => Math.abs(d).toFixed(1)
export const signedYears = (d: number) => (d <= 0 ? '−' : '+') + years(d)
export const decimal = (d: number) => d.toFixed(1)
const plural = (n: number, one: string, many: string) => (n === 1 ? one : many)

interface HeroInput {
  bioAge: BioAgeResult | null
  hasBirthDate: boolean
  overall: OverallCoverage
}

export function heroHeadline({ bioAge, overall }: HeroInput): string {
  if (bioAge) {
    if (bioAge.delta <= -1) return 'Younger Than Your Age'
    if (bioAge.delta < 1) return 'In Line With Your Age'
    if (bioAge.delta < 3) return 'A Little Above Your Age'
    return 'Above Your Age'
  }
  const pct = overall.percentInRange
  if (pct === null) return 'Getting Started'
  if (pct >= 80) return 'Mostly In Range'
  if (pct >= 50) return 'Partly In Range'
  return 'Some Results To Review'
}

export function heroNarrative({ bioAge, hasBirthDate, overall }: HeroInput): string {
  const parts: string[] = []
  if (bioAge) {
    const d = years(bioAge.delta)
    if (bioAge.delta <= -1)
      parts.push(`Your blood markers point to a biological age of about ${decimal(bioAge.phenoAge)}, roughly ${d} years younger than your calendar age of ${bioAge.chronologicalAge}.`)
    else if (bioAge.delta < 1)
      parts.push(`Your blood markers point to a biological age of about ${decimal(bioAge.phenoAge)}, close to your calendar age of ${bioAge.chronologicalAge}.`)
    else
      parts.push(`Your blood markers point to a biological age of about ${decimal(bioAge.phenoAge)}, roughly ${d} years above your calendar age of ${bioAge.chronologicalAge}.`)
    parts.push('It is an estimate, and a snapshot rather than a verdict.')
  } else if (hasBirthDate) {
    parts.push('A few more results are needed before LabMate can estimate your biological age.')
  }
  if (overall.percentInRange !== null) {
    const t = overall.testedMarkers
    if (overall.outOfRangeCount === 0) parts.push(`All ${t} tested ${plural(t, 'marker sits', 'markers sit')} within range.`)
    else parts.push(`${overall.percentInRange}% of your ${t} tested markers sit within range.`)
  }
  if (!hasBirthDate) parts.push('Add your date of birth to see how your results compare with your age.')
  return parts.join(' ')
}

export function bioAgeNarrative(bio: BioAgeResult): string {
  let s = `This estimate uses nine routine blood markers and your age as of ${formatIsoDate(bio.asOfDate)}.`
  if (bio.delta <= -1) s += ` It comes out about ${years(bio.delta)} years younger than your calendar age.`
  else if (bio.delta < 1) s += ' It sits close to your calendar age.'
  else
    s += ` It comes out about ${years(bio.delta)} years above your calendar age, which can shift with short-term events like a recent illness.`
  return s + ' Treat it as illustrative, not as a medical result.'
}

export const contributorStatus = (c: BioAgeContribution) =>
  c.contributionYears > 0 ? `Adds about ${years(c.contributionYears)} years` : `Takes off about ${years(c.contributionYears)} years`

export function overallNarrative(o: OverallCoverage, lastUpdated: string | null): string {
  if (o.testedMarkers === 0) return 'Once results are imported, this shows how many sit within their ranges.'
  let s = `${o.inRangeCount} of ${o.testedMarkers} tested ${plural(o.testedMarkers, 'marker is', 'markers are')} within range`
  s += o.outOfRangeCount === 0 ? '.' : `, and ${o.outOfRangeCount} ${plural(o.outOfRangeCount, 'sits', 'sit')} outside.`
  if (lastUpdated) s += ` Your most recent result is from ${formatIsoDate(lastUpdated)}.`
  return s
}

export function coverageNarrative(o: OverallCoverage): string {
  const pct = o.totalMarkers > 0 ? Math.floor((o.testedMarkers / o.totalMarkers) * 100) : 0
  return `You have results for ${o.testedMarkers} of ${o.totalMarkers} tracked markers, about ${pct}% of the picture. Untested areas are simply not covered yet, they are not a concern in themselves.`
}

export function categoryNarrative(c: CategoryCoverage): string {
  if (c.testedMarkers === 0) return 'No results here yet. Adding a test would fill in this part of the picture.'
  if (c.outOfRangeCount === 0) return `All ${c.testedMarkers} tested ${plural(c.testedMarkers, 'marker sits', 'markers sit')} within range.`
  return `${c.outOfRangeCount} of ${c.testedMarkers} tested ${plural(c.testedMarkers, 'marker sits', 'markers sit')} outside range. A doctor can help put that in context.`
}

export function findingsIntro(count: number): string {
  return count === 0
    ? 'Nothing is outside its range right now. That is a snapshot, and worth rechecking at your usual interval.'
    : 'These categories have at least one result outside its range, most affected first. This is general information, not a diagnosis.'
}

export const findingCaveat =
  'LabMate does not guess at causes, timelines or doses. Those depend on your history and need a clinician.'
