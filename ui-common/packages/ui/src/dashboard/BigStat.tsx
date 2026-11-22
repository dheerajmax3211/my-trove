import { forwardRef, type HTMLAttributes, type ReactNode } from 'react'
import { cx } from '../internal/cx'
import { CountUp } from '../motion/CountUp'
import styles from './BigStat.module.css'

export interface BigStatSecondary {
  label: ReactNode
  value: ReactNode
}

export interface BigStatProps extends Omit<HTMLAttributes<HTMLDivElement>, 'children'> {
  /** The huge figure. Numbers count up; strings are shown as given. */
  value: number | string
  /** Small label beside the figure: "kcal today", "bpm", "%". */
  unit?: ReactNode
  /** The lime pill above the figure: "+5%". */
  delta?: ReactNode
  /** `up` and `flat` are lime; `down` is a soft red. Default `up`. */
  trend?: 'up' | 'down' | 'flat'
  /** A short sentence under the figure, for assistive tech and sighted readers alike. */
  caption?: ReactNode
  /** Figures aligned to the right edge ("Avg 78 bpm"). */
  secondary?: readonly BigStatSecondary[]
  /** `lg` is the 64px bento figure; `md` suits narrower cards. */
  size?: 'md' | 'lg'
  /** Intl.NumberFormat options for numeric values. */
  format?: Intl.NumberFormatOptions
  /** Count up on scroll-in. Default true. */
  countUp?: boolean
}

/**
 * The dashboard number: a huge, tight figure with a tiny unit beside it, a lime delta pill riding
 * on top and optional right-aligned secondary figures. Tabular numerals, so values do not jitter
 * while counting.
 */
export const BigStat = forwardRef<HTMLDivElement, BigStatProps>(function BigStat(
  {
    value,
    unit,
    delta,
    trend = 'up',
    caption,
    secondary,
    size = 'lg',
    format,
    countUp = true,
    className,
    ...rest
  },
  ref,
) {
  return (
    <div ref={ref} className={cx(styles.stat, size === 'md' && styles.md, className)} {...rest}>
      <div className={styles.main}>
        {delta ? (
          <span className={cx(styles.delta, trend === 'down' && styles.down)}>{delta}</span>
        ) : null}
        <p className={styles.figure}>
          {typeof value === 'number' && countUp ? (
            <CountUp value={value} {...(format ? { format } : {})} />
          ) : typeof value === 'number' ? (
            value.toLocaleString(undefined, format)
          ) : (
            value
          )}
          {unit ? <span className={styles.unit}>{unit}</span> : null}
        </p>
        {caption ? <p className={styles.caption}>{caption}</p> : null}
      </div>
      {secondary && secondary.length > 0 ? (
        <dl className={styles.secondary}>
          {secondary.map((item, i) => (
            <div key={i} className={styles.secondaryItem}>
              <dt>{item.label}</dt>
              <dd>{item.value}</dd>
            </div>
          ))}
        </dl>
      ) : null}
    </div>
  )
})
