interface Props {
  segments: { fraction: number; color: string }[]
  label?: string
  size?: number
  lineWidth?: number
}

/** Single-ring score (port of iOS ScoreRing): consecutive coloured arcs from 12 o'clock over a grey track. */
export function ScoreRing({ segments, label, size = 80, lineWidth = 9 }: Props) {
  const r = (size - lineWidth) / 2
  const c = 2 * Math.PI * r
  let offset = 0
  return (
    <div className="score-ring" style={{ width: size, height: size }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden="true">
        <g transform={`rotate(-90 ${size / 2} ${size / 2})`}>
          <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--fill)" strokeWidth={lineWidth} />
          {segments.map((s, i) => {
            const len = Math.max(0, Math.min(1, s.fraction)) * c
            const el = (
              <circle
                key={i}
                cx={size / 2}
                cy={size / 2}
                r={r}
                fill="none"
                stroke={s.color}
                strokeWidth={lineWidth}
                strokeLinecap="butt"
                strokeDasharray={`${len} ${c}`}
                strokeDashoffset={-offset}
              />
            )
            offset += len
            return el
          })}
        </g>
      </svg>
      {label !== undefined && (
        <span className="score-ring-label" style={{ fontSize: Math.max(11, size * 0.24) }}>
          {label}
        </span>
      )}
    </div>
  )
}
