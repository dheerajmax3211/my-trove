import type { CSSProperties, ReactNode } from 'react'
import { cx } from '../internal/cx'
import { useReducedMotion } from '../internal/use-reduced-motion'
import { useInView } from '../motion/use-in-view'
import styles from './BubbleChart.module.css'
import type { DashTone } from './ProgressStat'

export interface Bubble {
  /** Name, read by assistive tech and shown under the figure when there is room. */
  label: string
  value: number
  /** Printed inside the bubble next to the figure: "kcal", "hrs". */
  unit?: ReactNode
  tone?: DashTone
}

export interface BubbleChartProps {
  bubbles: readonly Bubble[]
  /** Accessible name for the chart. */
  label: string
  /** Chart height in px. Default 220. */
  height?: number
  format?: (value: number) => string
  className?: string
}

const ORDER: DashTone[] = ['lilac', 'ink', 'lime', 'brass']

/**
 * Overlapping bubbles sized by value, each holding its figure and unit. They pop in on a spring,
 * one after another, when the chart scrolls into view. Layout is plain CSS (percent positions),
 * so it scales with its container. The values are real text, never only area.
 */
export function BubbleChart({
  bubbles,
  label,
  height = 220,
  format = (v) => v.toLocaleString(),
  className,
}: BubbleChartProps) {
  const reduced = useReducedMotion()
  const [ref, inView] = useInView<HTMLDivElement>({ disabled: reduced, amount: 0.3 })
  const max = Math.max(1, ...bubbles.map((b) => b.value))
  // Diameter scales with the square root of the value so AREA tracks the number.
  const ds = bubbles.map((b) => 0.5 + 0.5 * Math.sqrt(Math.max(0, b.value) / max))
  // Lay the bubbles out left to right, overlapping, with alternating vertical offsets.
  const OVERLAP = 0.16
  const widths = ds.map((d) => d * height)
  const total =
    widths.reduce((a, w) => a + w, 0) - OVERLAP * height * Math.max(0, bubbles.length - 1)
  let cursor = 0
  const OFFSETS = [0.02, 0.28, 0.05, 0.22]
  return (
    <div
      ref={ref}
      role="group"
      aria-label={label}
      className={cx(styles.chart, className)}
      data-revealed={inView ? 'true' : 'false'}
      style={{ height, maxWidth: total }}
    >
      {bubbles.map((b, i) => {
        const w = widths[i]!
        const left = cursor
        cursor += w - OVERLAP * height
        const tone = b.tone ?? ORDER[i % ORDER.length]!
        return (
          <div
            key={b.label}
            className={cx(styles.bubble, styles[tone])}
            style={
              {
                width: `${(w / total) * 100}%`,
                left: `${(left / total) * 100}%`,
                top: `${(OFFSETS[i % OFFSETS.length] ?? 0) * (height - w) + 0}px`,
                zIndex: bubbles.length - i,
                '--_delay': `${i * 0.12}s`,
              } as CSSProperties
            }
          >
            <span className={styles.figure}>
              {format(b.value)}
              {b.unit ? <span className={styles.unit}>{b.unit}</span> : null}
            </span>
            <span className={styles.name}>{b.label}</span>
          </div>
        )
      })}
    </div>
  )
}
