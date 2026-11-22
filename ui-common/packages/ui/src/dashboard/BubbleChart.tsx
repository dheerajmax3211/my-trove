import type { CSSProperties, ReactNode } from 'react'
import { cx } from '../internal/cx'
import { useReducedMotion } from '../internal/use-reduced-motion'
import { useInView } from '../motion/use-in-view'
import styles from './BubbleChart.module.css'
import type { DashTone } from './ProgressStat'

export interface Bubble {
  /** Name, read by assistive tech and shown under the figure. */
  label: string
  value: number
  /** Printed inside the bubble next to the figure: "kcal", "hrs". */
  unit?: ReactNode
  tone?: DashTone
}

export interface BubbleChartProps {
  /** Up to four bubbles; the largest value gets the largest circle. */
  bubbles: readonly Bubble[]
  /** Accessible name for the chart. */
  label: string
  format?: (value: number) => string
  className?: string
}

const ORDER: DashTone[] = ['lilac', 'ink', 'lime', 'brass']

/** Cluster anchors (percent of the square stage): where each bubble's top-left sits. */
const ANCHORS: readonly [number, number][] = [
  [0, 2],
  [47, 26],
  [10, 58],
  [60, 62],
]

/**
 * Overlapping bubbles sized by value, each holding its figure and unit. They pop in on a spring,
 * one after another, when the chart scrolls into view. The stage is a square that scales with its
 * container (percent positions, container-query type), and the values are real text, never only
 * area.
 */
export function BubbleChart({
  bubbles,
  label,
  format = (v) => v.toLocaleString(),
  className,
}: BubbleChartProps) {
  const reduced = useReducedMotion()
  const [ref, inView] = useInView<HTMLDivElement>({ disabled: reduced, amount: 0.3 })
  const shown = bubbles.slice(0, 4)
  const max = Math.max(1, ...shown.map((b) => b.value))
  return (
    <div
      ref={ref}
      role="group"
      aria-label={label}
      className={cx(styles.chart, className)}
      data-revealed={inView ? 'true' : 'false'}
    >
      {shown.map((b, i) => {
        // Diameter scales with the square root of the value so AREA tracks the number.
        const d = 34 + 30 * Math.sqrt(Math.max(0, b.value) / max)
        const [x, y] = ANCHORS[i]!
        const tone = b.tone ?? ORDER[i % ORDER.length]!
        return (
          <div
            key={b.label}
            className={cx(styles.bubble, styles[tone])}
            style={
              {
                width: `${d}%`,
                left: `${Math.min(x, 100 - d)}%`,
                top: `${Math.min(y, 100 - d)}%`,
                zIndex: Math.round(100 - d),
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
