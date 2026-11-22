import type { CSSProperties, ReactNode } from 'react'
import { cx } from '../internal/cx'
import { useReducedMotion } from '../internal/use-reduced-motion'
import { useInView } from '../motion/use-in-view'
import styles from './Donut.module.css'
import { TONE_ORDER, toneColor, type ChartTone } from './tone'

export interface DonutSegment {
  label: string
  value: number
  tone?: ChartTone
}

export interface DonutProps {
  segments: readonly DonutSegment[]
  /** Accessible name, e.g. "Spending by category". */
  label: string
  /** Diameter in px. Default 176. */
  size?: number
  /** Ring thickness in px. Default 16. */
  thickness?: number
  /** Content in the hole: a total and a caption. */
  center?: ReactNode
  /** Format values in the legend. Default: locale number. */
  format?: (value: number) => string
  /** Show the legend with values and shares. Default true. */
  legend?: boolean
  className?: string
}

/**
 * A ring chart whose segments sweep in one after another. The legend always prints each
 * segment's value and share, so the chart never relies on colour alone. Plain SVG.
 */
export function Donut({
  segments,
  label,
  size = 176,
  thickness = 16,
  center,
  format = (v) => v.toLocaleString(),
  legend = true,
  className,
}: DonutProps) {
  const reduced = useReducedMotion()
  const [ref, inView] = useInView<HTMLDivElement>({ disabled: reduced, amount: 0.3 })
  const total = segments.reduce((sum, s) => sum + Math.max(0, s.value), 0)
  const r = (size - thickness) / 2
  const gap = segments.length > 1 ? 1.2 : 0
  const shares = segments.map((s) => (total === 0 ? 0 : (Math.max(0, s.value) / total) * 100))

  const arcs = segments.map((s, i) => {
    const share = shares[i]!
    const start = shares.slice(0, i).reduce((a, b) => a + b, 0)
    return {
      ...s,
      share,
      start,
      tone: s.tone ?? TONE_ORDER[i % TONE_ORDER.length]!,
      length: Math.max(0, share - gap),
    }
  })

  return (
    <div
      ref={ref}
      className={cx(styles.donut, className)}
      data-revealed={inView ? 'true' : 'false'}
    >
      <div className={styles.ring} style={{ width: size, height: size }}>
        <svg viewBox={`0 0 ${size} ${size}`} role="img" aria-label={label} className={styles.svg}>
          <circle
            cx={size / 2}
            cy={size / 2}
            r={r}
            className={styles.track}
            strokeWidth={thickness}
          />
          {arcs.map((a, i) => (
            <circle
              key={a.label}
              cx={size / 2}
              cy={size / 2}
              r={r}
              pathLength={100}
              className={styles.arc}
              strokeWidth={thickness}
              stroke={toneColor(a.tone)}
              strokeDasharray={`${a.length} ${100 - a.length}`}
              strokeDashoffset={-(a.start + gap / 2)}
              style={{ '--_delay': `${i * 0.12}s` } as CSSProperties}
              transform={`rotate(-90 ${size / 2} ${size / 2})`}
            />
          ))}
        </svg>
        {center ? <div className={styles.center}>{center}</div> : null}
      </div>
      {legend ? (
        <ul className={styles.legend} aria-label={`${label}, breakdown`}>
          {arcs.map((a) => (
            <li key={a.label} className={styles.item}>
              <span
                className={styles.swatch}
                style={{ background: toneColor(a.tone) }}
                aria-hidden="true"
              />
              <span className={styles.name}>{a.label}</span>
              <span className={styles.figure}>
                {format(a.value)}
                <span className={styles.share}> {Math.round(a.share)}%</span>
              </span>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  )
}
