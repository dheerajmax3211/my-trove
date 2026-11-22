import type { CSSProperties } from 'react'
import { cx } from '../internal/cx'
import { useReducedMotion } from '../internal/use-reduced-motion'
import { VisuallyHidden } from '../components/VisuallyHidden/VisuallyHidden'
import { useInView } from '../motion/use-in-view'
import styles from './DotMatrix.module.css'

export interface DotMatrixColumn {
  /** Label under the column ("Mon"). */
  label: string
  /** How many dots are filled, from the bottom. */
  value: number
}

export interface DotMatrixProps {
  columns: readonly DotMatrixColumn[]
  /** Dots per column. Default 8. */
  rows?: number
  /** Accessible name, e.g. "Sleep quality by night". */
  label: string
  /** Index of the column to emphasise with a solid ink dot on top. */
  highlight?: number
  className?: string
}

/**
 * A dot-matrix bar chart: each column is a stack of small circles, filled lilac up to its value
 * and pale lilac above. Columns fill from the bottom on scroll-in, left to right. Every column's
 * value is available to assistive tech as a list.
 */
export function DotMatrix({ columns, rows = 8, label, highlight, className }: DotMatrixProps) {
  const reduced = useReducedMotion()
  const [ref, inView] = useInView<HTMLDivElement>({ disabled: reduced, amount: 0.3 })
  return (
    <div
      ref={ref}
      className={cx(styles.matrix, className)}
      data-revealed={inView ? 'true' : 'false'}
      style={{ '--_cols': columns.length } as CSSProperties}
    >
      <div className={styles.plot} aria-hidden="true">
        {columns.map((col, c) => (
          <div key={col.label} className={styles.column}>
            {Array.from({ length: rows }, (_, r) => {
              const fromBottom = rows - 1 - r
              const filled = fromBottom < Math.round(col.value)
              const isTop = filled && fromBottom === Math.round(col.value) - 1
              return (
                <span
                  key={r}
                  className={cx(
                    styles.dot,
                    filled && styles.filled,
                    isTop && highlight === c && styles.peak,
                  )}
                  style={{ '--_delay': `${c * 0.05 + fromBottom * 0.025}s` } as CSSProperties}
                />
              )
            })}
            <span className={styles.axis}>{col.label}</span>
          </div>
        ))}
      </div>
      <VisuallyHidden>
        <span>{label}</span>
        <ul>
          {columns.map((c) => (
            <li key={c.label}>
              {c.label}: {c.value} of {rows}
            </li>
          ))}
        </ul>
      </VisuallyHidden>
    </div>
  )
}
