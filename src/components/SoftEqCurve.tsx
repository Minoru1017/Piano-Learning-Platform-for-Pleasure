/**
 * Soft EQ-style curve for BPM / layer presence — decorative + informational,
 * not a DAW mixer.
 */
interface SoftEqCurveProps {
  /** 0–1 values sampled left→right */
  values: number[]
  label?: string
  className?: string
}

export function SoftEqCurve({ values, label, className = '' }: SoftEqCurveProps) {
  const w = 240
  const h = 48
  const pts = values.length < 2 ? [0.3, 0.35] : values
  const step = w / (pts.length - 1)
  let d = `M 0 ${h - pts[0]! * h * 0.85}`
  for (let i = 1; i < pts.length; i++) {
    const x = i * step
    const y = h - pts[i]! * h * 0.85
    const px = (i - 1) * step
    const py = h - pts[i - 1]! * h * 0.85
    const cx = (px + x) / 2
    d += ` C ${cx} ${py}, ${cx} ${y}, ${x} ${y}`
  }
  const area = `${d} L ${w} ${h} L 0 ${h} Z`

  return (
    <div className={`soft-eq ${className}`.trim()} aria-hidden={label ? undefined : true}>
      {label && <span className="soft-eq__label">{label}</span>}
      <svg className="soft-eq__svg" viewBox={`0 0 ${w} ${h}`} width="100%" height={h} role="img">
        {[0.25, 0.5, 0.75].map((t) => (
          <line
            key={t}
            className="soft-eq__tick"
            x1={w * t}
            y1={4}
            x2={w * t}
            y2={h - 2}
          />
        ))}
        <path className="soft-eq__fill" d={area} />
        <path className="soft-eq__stroke" d={d} fill="none" />
        {pts.map((v, i) => (
          <circle
            key={i}
            className="soft-eq__dot"
            cx={i * step}
            cy={h - v * h * 0.85}
            r={2.5}
          />
        ))}
      </svg>
    </div>
  )
}
