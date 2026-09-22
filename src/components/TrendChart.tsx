import { useState } from 'react'
import { formatIsoDate } from '../lib/dates'
import { effectiveRange } from '../lib/healthScore'
import type { MarkerDef, MarkerResult } from '../types'

interface Props {
  results: MarkerResult[]
  unit: string
  marker?: MarkerDef
}

const WIDTH = 640
const HEIGHT = 220
const PAD_LEFT = 44
const PAD_RIGHT = 16
const PAD_TOP = 16
const PAD_BOTTOM = 28

export function TrendChart({ results, unit, marker }: Props) {
  const [hoverIdx, setHoverIdx] = useState<number | null>(null)

  const points = results
    .filter((r) => r.value !== null)
    .slice()
    .sort((a, b) => (a.date < b.date ? -1 : 1))

  if (points.length === 0) {
    return <p style={{ color: 'var(--text-muted)', fontSize: 13 }}>No numeric results to chart yet.</p>
  }

  const latest = points[points.length - 1]
  const values = points.map((p) => p.value as number)
  const { low: rangeLow, high: rangeHigh, isStandard } = effectiveRange(latest, marker)

  const allValues = [...values, ...(rangeLow !== null ? [rangeLow] : []), ...(rangeHigh !== null ? [rangeHigh] : [])]
  const min = Math.min(...allValues)
  const max = Math.max(...allValues)
  const span = max - min || 1
  const yPad = span * 0.15

  const yMin = min - yPad
  const yMax = max + yPad

  const times = points.map((p) => new Date(p.date).getTime())
  const tMin = Math.min(...times)
  const tMax = Math.max(...times)
  const tSpan = tMax - tMin || 1

  const xFor = (t: number) => PAD_LEFT + ((t - tMin) / tSpan) * (WIDTH - PAD_LEFT - PAD_RIGHT)
  const yFor = (v: number) => PAD_TOP + (1 - (v - yMin) / (yMax - yMin)) * (HEIGHT - PAD_TOP - PAD_BOTTOM)

  const coords = points.map((p, i) => ({ x: xFor(times[i]), y: yFor(p.value as number), point: p }))
  const path = coords.map((c, i) => `${i === 0 ? 'M' : 'L'}${c.x.toFixed(1)},${c.y.toFixed(1)}`).join(' ')

  const bandTop = rangeHigh !== null ? yFor(rangeHigh) : null
  const bandBottom = rangeLow !== null ? yFor(rangeLow) : null

  const yTicks = [yMin, (yMin + yMax) / 2, yMax]

  const hovered = hoverIdx !== null ? coords[hoverIdx] : null

  return (
    <div style={{ position: 'relative' }}>
      <svg
        viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
        width="100%"
        height={HEIGHT}
        onMouseLeave={() => setHoverIdx(null)}
        onMouseMove={(e) => {
          const svg = e.currentTarget
          const rect = svg.getBoundingClientRect()
          const px = ((e.clientX - rect.left) / rect.width) * WIDTH
          let nearest = 0
          let bestDist = Infinity
          coords.forEach((c, i) => {
            const d = Math.abs(c.x - px)
            if (d < bestDist) {
              bestDist = d
              nearest = i
            }
          })
          setHoverIdx(nearest)
        }}
      >
        {bandTop !== null && bandBottom !== null && (
          <rect
            x={PAD_LEFT}
            y={bandTop}
            width={WIDTH - PAD_LEFT - PAD_RIGHT}
            height={Math.max(bandBottom - bandTop, 0)}
            fill="var(--status-good)"
            opacity={isStandard ? 0.06 : 0.1}
            strokeDasharray={isStandard ? '4 3' : undefined}
            stroke={isStandard ? 'var(--status-good)' : undefined}
            strokeOpacity={isStandard ? 0.4 : undefined}
          />
        )}
        {isStandard && bandTop !== null && (
          <text x={WIDTH - PAD_RIGHT} y={bandTop - 4} fontSize={9} fill="var(--text-muted)" textAnchor="end">
            general range
          </text>
        )}

        {yTicks.map((t, i) => (
          <g key={i}>
            <line x1={PAD_LEFT} x2={WIDTH - PAD_RIGHT} y1={yFor(t)} y2={yFor(t)} stroke="var(--gridline)" strokeWidth={1} />
            <text x={PAD_LEFT - 8} y={yFor(t) + 3} fontSize={10} fill="var(--text-muted)" textAnchor="end">
              {t.toFixed(1)}
            </text>
          </g>
        ))}

        <path d={path} fill="none" stroke="var(--series-1)" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />

        {coords.map((c, i) => (
          <circle
            key={i}
            cx={c.x}
            cy={c.y}
            r={i === coords.length - 1 || i === hoverIdx ? 5 : 4}
            fill={c.point.flag ? 'var(--status-serious)' : 'var(--series-1)'}
            stroke="var(--surface-1)"
            strokeWidth={2}
          />
        ))}

        {hovered && (
          <line x1={hovered.x} x2={hovered.x} y1={PAD_TOP} y2={HEIGHT - PAD_BOTTOM} stroke="var(--baseline)" strokeWidth={1} />
        )}

        {coords.map((c, i) => (
          <text key={i} x={c.x} y={HEIGHT - 8} fontSize={9} fill="var(--text-muted)" textAnchor="middle">
            {i === 0 || i === coords.length - 1 ? formatIsoDate(c.point.date).replace(/ \d{4}$/, '') : ''}
          </text>
        ))}
      </svg>

      {hovered && (
        <div
          style={{
            position: 'absolute',
            left: `${(hovered.x / WIDTH) * 100}%`,
            top: 0,
            transform: 'translateX(-50%)',
            background: 'var(--surface-1)',
            border: '1px solid var(--border)',
            borderRadius: 6,
            padding: '4px 8px',
            fontSize: 12,
            whiteSpace: 'nowrap',
            pointerEvents: 'none',
          }}
        >
          <strong>{hovered.point.displayValue}</strong> {unit} · {formatIsoDate(hovered.point.date)}
          {hovered.point.flag && <span style={{ color: 'var(--status-serious)' }}> flagged</span>}
        </div>
      )}
    </div>
  )
}
