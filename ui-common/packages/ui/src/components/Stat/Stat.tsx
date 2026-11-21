import { forwardRef, useId, type HTMLAttributes, type ReactNode } from 'react'
import { cx } from '../../internal/cx'
import { ArrowDownIcon, ArrowUpIcon, MinusIcon } from '../../internal/icons'
import { Sparkline, type SparklineTone } from '../Sparkline/Sparkline'
import { VisuallyHidden } from '../VisuallyHidden/VisuallyHidden'
import styles from './Stat.module.css'

export type StatTrend = 'up' | 'down' | 'flat'

export interface StatProps extends Omit<HTMLAttributes<HTMLDivElement>, 'children'> {
  label: ReactNode
  /** The figure, already formatted ("1,284", "42 ms", "$3,120"). */
  value: ReactNode
  /** The change, already formatted ("+12%", "-3 requests"). */
  delta?: ReactNode
  /** Direction of the change. Drives the arrow and the spoken "up/down/unchanged". */
  trend?: StatTrend
  /** Which direction is good news. `down` for error rates and latency. Default `up`. */
  goodDirection?: 'up' | 'down'
  /** Small print under the figure ("vs. previous 7 days"). */
  hint?: ReactNode
  /** A trend line next to the figure. */
  sparkline?: readonly number[]
  /** Describes the sparkline for assistive tech ("Requests per day, last 14 days"). */
  sparklineLabel?: string
  sparklineTone?: SparklineTone
}

const TREND_WORD: Record<StatTrend, string> = {
  up: 'Up',
  down: 'Down',
  flat: 'Unchanged',
}

/** A number with its context: label, change, optional trend line. Reads as "label, value, change". */
export const Stat = forwardRef<HTMLDivElement, StatProps>(function Stat(
  {
    label,
    value,
    delta,
    trend = 'flat',
    goodDirection = 'up',
    hint,
    sparkline,
    sparklineLabel,
    sparklineTone,
    className,
    ...rest
  },
  ref,
) {
  const labelId = useId()
  const good = trend === 'flat' ? 'neutral' : trend === goodDirection ? 'good' : 'bad'
  const TrendIcon = trend === 'up' ? ArrowUpIcon : trend === 'down' ? ArrowDownIcon : MinusIcon
  const tone: SparklineTone =
    sparklineTone ?? (good === 'bad' ? 'danger' : good === 'good' ? 'success' : 'accent')
  return (
    <div
      ref={ref}
      role="group"
      aria-labelledby={labelId}
      data-trend={trend}
      className={cx(styles.stat, className)}
      {...rest}
    >
      <p id={labelId} className={styles.label}>
        {label}
      </p>
      <div className={styles.figure}>
        <p className={styles.value}>{value}</p>
        {sparkline && sparkline.length > 1 ? (
          <Sparkline
            data={sparkline}
            tone={tone}
            width={96}
            height={36}
            {...(sparklineLabel ? { label: sparklineLabel } : {})}
          />
        ) : null}
      </div>
      {delta !== undefined || hint ? (
        <p className={styles.meta}>
          {delta !== undefined ? (
            <span className={cx(styles.delta, styles[good])}>
              <TrendIcon size={14} />
              <VisuallyHidden>{TREND_WORD[trend]}, </VisuallyHidden>
              {delta}
            </span>
          ) : null}
          {hint ? <span className={styles.hint}>{hint}</span> : null}
        </p>
      ) : null}
    </div>
  )
})
