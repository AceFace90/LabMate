import { formatIsoDate } from './dates'
import { effectiveRange, markerStatus } from './healthScore'
import type { MarkerDef, MarkerResult } from '../types'

/** Up to 2 decimals, trailing zeros trimmed (port of MarkerFormat.number). */
export function formatNumber(v: number): string {
  return Number(v.toFixed(2)).toString()
}

/** "43–120", "< 3.0", "> 60" or null when there is no range. */
export function rangeCaption(low: number | null, high: number | null): string | null {
  if (low !== null && high !== null) return `${formatNumber(low)}–${formatNumber(high)}`
  if (high !== null) return `< ${formatNumber(high)}`
  if (low !== null) return `> ${formatNumber(low)}`
  return null
}

export interface MarkerStory {
  headline: string
  narrative: string
}

/** Port of MarkerStory.make: editorial headline + grey narrative. `points` are numeric results, oldest first. */
export function makeMarkerStory(args: {
  label: string
  unit: string
  points: MarkerResult[]
  marker?: MarkerDef
}): MarkerStory {
  const { label, unit, points, marker } = args
  const latest = points[points.length - 1]
  if (!latest || latest.value === null) {
    const hint = marker?.manualOnly
      ? 'Log it by hand to start a trend.'
      : 'Import a report or add a result by hand to start a trend.'
    return { headline: `No ${label} Yet`, narrative: `You haven't recorded any numeric ${label} results. ${hint}` }
  }

  const value = latest.value
  const range = effectiveRange(latest, marker)
  const status = markerStatus(latest, marker)
  const u = unit ? ` ${unit}` : ''
  const latestText = latest.displayValue || formatNumber(value)
  const sentences = [`Your latest ${label} is ${latestText}${u}, recorded ${formatIsoDate(latest.date)}.`]

  let headline: string
  const prev = points.length >= 2 ? points[points.length - 2] : undefined
  if (prev && prev.value !== null) {
    const pv = prev.value
    const delta = value - pv
    const rel = Math.abs(delta) / Math.max(Math.abs(pv), 0.0001)
    if (rel < 0.02) {
      headline = `${label} Steady`
      sentences.push(`That's about the same as ${formatNumber(pv)} on ${formatIsoDate(prev.date)}.`)
    } else {
      headline = delta > 0 ? `${label} Trending Up` : `${label} Trending Down`
      const pct = pv === 0 ? '' : ` (${Math.round(rel * 100)}%)`
      sentences.push(
        `That's ${delta > 0 ? 'up' : 'down'} ${formatNumber(Math.abs(delta))}${pct} from ${formatNumber(pv)} on ${formatIsoDate(prev.date)}.`,
      )
    }
  } else {
    headline =
      status === 'in_range'
        ? `${label} In Range`
        : status === 'low'
          ? `${label} Low`
          : status === 'high'
            ? `${label} High`
            : `${label} Recorded`
  }

  const caption = rangeCaption(range.low, range.high)
  if (caption) {
    const kind = range.isStandard ? 'general reference range' : 'reference range'
    if (status === 'in_range') sentences.push(`It sits within the ${kind} of ${caption}${u}.`)
    else if (status === 'low') sentences.push(`That is below the ${kind} of ${caption}${u}.`)
    else if (status === 'high') sentences.push(`That is above the ${kind} of ${caption}${u}.`)
  }
  if (points.length > 2) sentences.push(`Based on ${points.length} results since ${formatIsoDate(points[0].date)}.`)
  return { headline, narrative: sentences.join(' ') }
}
