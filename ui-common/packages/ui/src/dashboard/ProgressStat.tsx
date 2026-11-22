import type { CSSProperties, ReactNode } from 'react'
import { cx } from '../internal/cx'
import { useReducedMotion } from '../internal/use-reduced-motion'
import { CountUp } from '../motion/CountUp'
import { useInView } from '../motion/use-in-view'
import styles from './ProgressStat.module.css'

export type DashTone = 'lilac' | 'lime' | 'ink' | 'brass'

export interface ProgressStatProps {
  /** Name with a coloured dot: "Deep sleep". */
  label: ReactNode
  /** 0..100. */
  value: number
  tone?: DashTone
  /** Short note under the bar: "Goal 8 h". */
  caption?: ReactNode
  className?: string
}

/**
 * A thick, rounded progress bar with a large percentage. The bar grows from the left when it
 * scrolls into view; the figure counts up. Exposed to assistive tech as a `meter`-style
 * progressbar with the label as its name.
 */
export function ProgressStat({
  label,
  value,
  tone = 'lilac',
  caption,
  className,
}: ProgressStatProps) {
  const reduced = useReducedMotion()
  const [ref, inView] = useInView<HTMLDivElement>({ disabled: reduced, amount: 0.3 })
  const pct = Math.max(0, Math.min(100, value))
  return (
    <div
      ref={ref}
      className={cx(styles.progress, styles[tone], className)}
      data-revealed={inView ? 'true' : 'false'}
      style={{ '--_pct': String(pct / 100) } as CSSProperties}
    >
      <div className={styles.head}>
        <span className={styles.label}>
          <span className={styles.dot} aria-hidden="true" />
          {label}
        </span>
        <span className={styles.figure}>
          <CountUp value={pct} suffix="%" duration={1.2} />
        </span>
      </div>
      <div
        className={styles.track}
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(pct)}
        aria-label={typeof label === 'string' ? label : 'Progress'}
      >
        <div className={styles.bar} />
      </div>
      {caption ? <div className={styles.caption}>{caption}</div> : null}
    </div>
  )
}
