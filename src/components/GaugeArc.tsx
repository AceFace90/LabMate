interface Props {
  /** 0..1 position of the knob along the arc. */
  progress: number
  label: string
  color: string
  size?: number
  lineWidth?: number
}

const SWEEP = 0.66 // fraction of a full circle the arc covers (matches iOS GaugeArc)

/** Open-bottom gauge with a soft highlight and knob (port of iOS GaugeArc). */
export function GaugeArc({ progress, label, color, size = 260, lineWidth = 34 }: Props) {
  const c = size / 2
  const r = (size - lineWidth) / 2
  const p = Math.max(0, Math.min(1, progress))
  const start = 90 + (1 - SWEEP) * 180 // degrees, clockwise from 3 o'clock
  const pt = (deg: number) => {
    const a = (deg * Math.PI) / 180
    return [c + r * Math.cos(a), c + r * Math.sin(a)]
  }
  const arc = (fromFrac: number, toFrac: number) => {
    const a0 = start + fromFrac * 360
    const a1 = start + toFrac * 360
    const [x0, y0] = pt(a0)
    const [x1, y1] = pt(a1)
    return `M${x0.toFixed(2)},${y0.toFixed(2)} A${r},${r} 0 ${a1 - a0 > 180 ? 1 : 0} 1 ${x1.toFixed(2)},${y1.toFixed(2)}`
  }
  const [kx, ky] = pt(start + p * SWEEP * 360)
  return (
    <div className="gauge-arc" style={{ width: size, height: size }} role="img" aria-label={label}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden="true">
        <path d={arc(0, SWEEP)} fill="none" stroke="var(--fill)" strokeWidth={lineWidth} strokeLinecap="round" />
        <path d={arc(Math.max(0, p * SWEEP - 0.08), p * SWEEP)} fill="none" stroke={color} strokeOpacity={0.3} strokeWidth={lineWidth} strokeLinecap="round" />
        <circle cx={kx} cy={ky} r={(lineWidth * 0.8) / 2} fill={color} />
      </svg>
      <span className="gauge-arc-label" style={{ fontSize: size * 0.32, color }}>{label}</span>
    </div>
  )
}
