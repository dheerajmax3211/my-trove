import type { CSSProperties } from 'react'
import { cx } from '../internal/cx'
import { useReducedMotion } from '../internal/use-reduced-motion'
import { useInView } from '../motion/use-in-view'
import styles from './BarList.module.css'
import { toneColor, type ChartTone } from './tone'

export interface BarListItem {
  label: string
  value: number
  /** Small text under the label (a count, a date). */
  hint?: string
  tone?: ChartTone
}

export interface BarListProps {
  items: readonly BarListItem[]
  /** Accessible name for the list. */
  label: string
  /** The value that fills a whole bar. Default: the largest item. */
  max?: number
  format?: (value: number) => string
  tone?: ChartTone
  className?: string
}

/**
 * Ranked horizontal bars: label and figure on one line, a bar under them that grows in when the
 * list scrolls into view. Values are always printed, so colour and length are never the only
 * signal. Transform-only animation.
 */
export function BarList({
  items,
  label,
  max,
  format = (v) => v.toLocaleString(),
  tone = 'ink',
  className,
}: BarListProps) {
  const reduced = useReducedMotion()
  const [ref, inView] = useInView<HTMLUListElement>({ disabled: reduced, amount: 0.2 })
  const ceiling = max ?? Math.max(1, ...items.map((i) => i.value))
  return (
    <ul
      ref={ref}
      aria-label={label}
      className={cx(styles.list, className)}
      data-revealed={inView ? 'true' : 'false'}
    >
      {items.map((item, i) => {
        const pct = Math.max(0, Math.min(1, item.value / ceiling))
        return (
          <li
            key={item.label}
            className={styles.row}
            style={
              {
                '--_pct': String(pct),
                '--_delay': `${i * 0.07}s`,
                '--_tone': toneColor(item.tone ?? tone),
              } as CSSProperties
            }
          >
            <div className={styles.head}>
              <span className={styles.label}>
                {item.label}
                {item.hint ? <span className={styles.hint}>{item.hint}</span> : null}
              </span>
              <span className={styles.value}>{format(item.value)}</span>
            </div>
            <div className={styles.track} aria-hidden="true">
              <div className={styles.bar} />
            </div>
          </li>
        )
      })}
    </ul>
  )
}
