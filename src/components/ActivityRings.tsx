import type { ReactNode } from 'react'

interface Ring {
  percent: number
  color: string
}

interface Props {
  rings: Ring[]
  /** Rendered centered inside the innermost ring - e.g. a headline stat. */
  center?: ReactNode
  size?: number
  stroke?: number
  gap?: number
}

/**
 * Concentric Apple-Watch-style rings, matching GymMate's ActivityRings (same
 * stroke/gap math, round caps, -90deg start so progress begins at 12 o'clock) -
 * just plain SVG here instead of react-native-svg, since this is a web app.
 */
export function ActivityRings({ rings, center, size = 140, stroke = 14, gap = 6 }: Props) {
  const mid = size / 2
  const outerR = size / 2 - stroke / 2

  return (
    <div style={{ position: 'relative', width: size, height: size, flexShrink: 0 }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        <g transform={`rotate(-90 ${mid} ${mid})`}>
          {rings.map((ring, i) => {
            const r = outerR - i * (stroke + gap)
            const circumference = 2 * Math.PI * r
            const dash = Math.max(0, Math.min(1, ring.percent)) * circumference
            return (
              <g key={i}>
                <circle cx={mid} cy={mid} r={r} stroke="var(--gridline)" strokeWidth={stroke} fill="none" />
                <circle
                  cx={mid}
                  cy={mid}
                  r={r}
                  stroke={ring.color}
                  strokeWidth={stroke}
                  fill="none"
                  strokeLinecap="round"
                  strokeDasharray={`${dash} ${circumference}`}
                />
              </g>
            )
          })}
        </g>
      </svg>
      {center && (
        <div
          style={{
            position: 'absolute',
            inset: 0,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            textAlign: 'center',
          }}
        >
          {center}
        </div>
      )}
    </div>
  )
}
