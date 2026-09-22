import type { MarkerStatus } from '../lib/healthScore'

interface Props {
  value: number
  low: number | null
  high: number | null
  status: MarkerStatus
  isStandard: boolean
}

/**
 * A proportional position indicator, not a clinical severity scale - the shaded
 * band is just "inside the reference range" vs "outside it", and the domain shown
 * is padded around the range purely so the marker has room to sit visually. It does
 * not imply values further from center are proportionally more dangerous.
 */
export function RangeBar({ value, low, high, status, isStandard }: Props) {
  if (low === null && high === null) return null

  let domainMin: number
  let domainMax: number
  let bandStartPct: number
  let bandEndPct: number

  if (low !== null && high !== null) {
    const pad = (high - low) * 0.25 || Math.abs(high) * 0.25 || 1
    domainMin = low - pad
    domainMax = high + pad
    bandStartPct = pct(low, domainMin, domainMax)
    bandEndPct = pct(high, domainMin, domainMax)
  } else if (high !== null) {
    domainMin = 0
    domainMax = high * 1.5 || 1
    bandStartPct = 0
    bandEndPct = pct(high, domainMin, domainMax)
  } else {
    domainMin = 0
    domainMax = (low as number) * 2 || 1
    bandStartPct = pct(low as number, domainMin, domainMax)
    bandEndPct = 100
  }

  const valuePct = Math.min(100, Math.max(0, pct(value, domainMin, domainMax)))
  const dotColor =
    status === 'in_range' ? 'var(--status-good)' : status === 'unknown' ? 'var(--baseline)' : 'var(--status-serious)'

  return (
    <div className="range-bar" title={isStandard ? 'Range shown is a general reference, not lab-printed' : undefined}>
      <div className="range-bar-track">
        <div className="range-bar-band" style={{ left: `${bandStartPct}%`, width: `${bandEndPct - bandStartPct}%` }} />
        <div
          className="range-bar-dot"
          style={{ left: `${valuePct}%`, background: dotColor, borderStyle: isStandard ? 'solid' : 'none' }}
        />
      </div>
      <div className="range-bar-labels">
        <span>{low ?? ''}</span>
        <span>{high ?? ''}</span>
      </div>
    </div>
  )
}

function pct(v: number, min: number, max: number): number {
  if (max === min) return 50
  return ((v - min) / (max - min)) * 100
}
