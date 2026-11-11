import { useEffect, useRef, useState } from 'react'
import { formatIsoDate } from '../lib/dates'
import { effectiveRange, showLabFlag } from '../lib/healthScore'
import type { MarkerDef, MarkerResult } from '../types'

interface Props {
  results: MarkerResult[]
  unit: string
  marker?: MarkerDef
  color?: string
}

const HEIGHT = 220
const PAD_LEFT = 8
const PAD_RIGHT = 40
const PAD_TOP = 16
const PAD_BOTTOM = 28

export function TrendChart({ results, unit, marker, color = 'var(--series-1)' }: Props) {
  const [hoverIdx, setHoverIdx] = useState<number | null>(null)
  // Draw at the real pixel width so text and dots are never stretched or letterboxed.
  const wrapRef = useRef<HTMLDivElement>(null)
  const [WIDTH, setWidth] = useState(640)
  useEffect(() => {
    const el = wrapRef.current
    if (!el) return
    const update = () => setWidth(Math.max(280, el.clientWidth))
    update()
    const ro = new ResizeObserver(update)
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

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
  const yPad = (max - min === 0 ? Math.max(Math.abs(max) * 0.1, 1) : max - min) * 0.2

  const yMin = min - yPad
  const yMax = max + yPad

  const times = points.map((p) => new Date(p.date).getTime())
  const tMin = Math.min(...times)
  const tMax = Math.max(...times)
  const tSpan = tMax - tMin || 1

  const xFor = (t: number) => PAD_LEFT + ((t - tMin) / tSpan) * (WIDTH - PAD_LEFT - PAD_RIGHT)
  const yFor = (v: number) => PAD_TOP + (1 - (v - yMin) / (yMax - yMin)) * (HEIGHT - PAD_TOP - PAD_BOTTOM)

  const coords = points.map((p, i) => ({ x: xFor(times[i]), y: yFor(p.value as number), point: p }))
  const path = smoothPath(coords)

  // One-sided ranges (PSA < 2.1, eGFR > 60) shade from the limit to the edge of the plot.
  const hasBand = rangeLow !== null || rangeHigh !== null
  const plotTop = PAD_TOP
  const plotBottom = HEIGHT - PAD_BOTTOM
  const bandTop = hasBand ? (rangeHigh !== null ? Math.max(plotTop, yFor(rangeHigh)) : plotTop) : null
  const bandBottom = hasBand ? (rangeLow !== null ? Math.min(plotBottom, yFor(rangeLow)) : plotBottom) : null

  const yTicks = [0, 1, 2, 3].map((i) => yMin + ((yMax - yMin) * (i + 0.5)) / 4)

  const hovered = hoverIdx !== null ? coords[hoverIdx] : null

  const shown = hovered ? hovered.point : latest
  return (
    <div ref={wrapRef} style={{ position: 'relative' }}>
      <div className="latest-readout">
        <div className="latest-label">{hovered ? 'SELECTED' : 'LATEST'}</div>
        <div>
          <span className="latest-value">{shown.displayValue}</span>
          <span className="latest-unit"> {unit}</span>
          {showLabFlag(shown, marker) && <span className="badge" style={{ marginLeft: 8 }}>Flagged</span>}
        </div>
        <div className="latest-date">{formatIsoDate(shown.date)}</div>
      </div>
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
            opacity={isStandard ? 0.1 : 0.18}
          />
        )}

        {yTicks.map((t, i) => (
          <g key={i}>
            <line x1={PAD_LEFT} x2={WIDTH - PAD_RIGHT} y1={yFor(t)} y2={yFor(t)} stroke="var(--gridline)" strokeWidth={1} />
            <text x={WIDTH - PAD_RIGHT + 6} y={yFor(t) + 3} fontSize={11} fill="var(--text-muted)" textAnchor="start">
              {Number(t.toFixed(1))}
            </text>
          </g>
        ))}

        <path d={path} fill="none" stroke={color} strokeOpacity={0.35} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />

        {coords.map((c, i) => (
          <circle
            key={i}
            cx={c.x}
            cy={c.y}
            r={i === coords.length - 1 ? 7 : 4}
            fill={showLabFlag(c.point, marker) ? 'var(--status-serious)' : color}
            fillOpacity={showLabFlag(c.point, marker) || i === coords.length - 1 ? 1 : 0.55}
          />
        ))}

        {hovered && (
          <line x1={hovered.x} x2={hovered.x} y1={PAD_TOP} y2={HEIGHT - PAD_BOTTOM} stroke="var(--baseline)" strokeWidth={1} />
        )}

        {(tSpan === 1 ? [tMin] : [tMin, (tMin + tMax) / 2, tMax]).map((t, i) => (
          <text key={i} x={xFor(t)} y={HEIGHT - 8} fontSize={11} fill="var(--text-muted)" textAnchor={tSpan === 1 || (i === 0 && tSpan !== 1) ? 'start' : i === 2 ? 'end' : 'middle'}>
            {new Date(t).toLocaleDateString('en-GB', { month: 'short', year: '2-digit' })}
          </text>
        ))}
      </svg>

    </div>
  )
}

/** Monotone cubic (Fritsch-Carlson) so the line is smooth without overshooting the data. */
function smoothPath(pts: { x: number; y: number }[]): string {
  const n = pts.length
  if (n === 1) return `M${pts[0].x.toFixed(1)},${pts[0].y.toFixed(1)}`
  const dx: number[] = []
  const m: number[] = []
  for (let i = 0; i < n - 1; i++) {
    dx.push(pts[i + 1].x - pts[i].x || 1)
    m.push((pts[i + 1].y - pts[i].y) / dx[i])
  }
  const t: number[] = [m[0]]
  for (let i = 1; i < n - 1; i++) t.push(m[i - 1] * m[i] <= 0 ? 0 : (m[i - 1] + m[i]) / 2)
  t.push(m[n - 2])
  for (let i = 0; i < n - 1; i++) {
    if (m[i] === 0) {
      t[i] = 0
      t[i + 1] = 0
      continue
    }
    const a = t[i] / m[i]
    const b = t[i + 1] / m[i]
    const h = Math.hypot(a, b)
    if (h > 3) {
      t[i] = (3 * a * m[i]) / h
      t[i + 1] = (3 * b * m[i]) / h
    }
  }
  let d = `M${pts[0].x.toFixed(1)},${pts[0].y.toFixed(1)}`
  for (let i = 0; i < n - 1; i++) {
    const h = dx[i] / 3
    d += ` C${(pts[i].x + h).toFixed(1)},${(pts[i].y + t[i] * h).toFixed(1)} ${(pts[i + 1].x - h).toFixed(1)},${(pts[i + 1].y - t[i + 1] * h).toFixed(1)} ${pts[i + 1].x.toFixed(1)},${pts[i + 1].y.toFixed(1)}`
  }
  return d
}
