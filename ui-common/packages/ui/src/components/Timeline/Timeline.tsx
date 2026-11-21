import { forwardRef, type HTMLAttributes, type ReactNode } from 'react'
import { cx } from '../../internal/cx'
import styles from './Timeline.module.css'

export type TimelineTone = 'neutral' | 'accent' | 'success' | 'warning' | 'danger' | 'brass'

export interface TimelineItem {
  id: string
  title: ReactNode
  description?: ReactNode
  /** Human text for the time ("Today, 9:14 am"). */
  time?: ReactNode
  /** Machine-readable time for the <time> element (ISO 8601). */
  dateTime?: string
  /** A glyph inside the node. Default is a plain dot. */
  icon?: ReactNode
  tone?: TimelineTone
  /** Extra content under the description (a badge row, a link). */
  meta?: ReactNode
}

export interface TimelineProps extends Omit<HTMLAttributes<HTMLOListElement>, 'children'> {
  items: readonly TimelineItem[]
  /** Accessible name. Default "Timeline". */
  label?: string
  /** Tighter spacing for side panels and feeds. */
  compact?: boolean
}

/** A vertical record of what happened, newest first or oldest first (the order you pass is kept). */
export const Timeline = forwardRef<HTMLOListElement, TimelineProps>(function Timeline(
  { items, label = 'Timeline', compact = false, className, ...rest },
  ref,
) {
  return (
    <ol
      ref={ref}
      aria-label={label}
      className={cx(styles.timeline, compact && styles.compact, className)}
      {...rest}
    >
      {items.map((item) => (
        <li key={item.id} className={cx(styles.item, styles[item.tone ?? 'neutral'])}>
          <span className={styles.node} aria-hidden="true">
            {item.icon ?? <span className={styles.dot} />}
          </span>
          <div className={styles.content}>
            <div className={styles.head}>
              <p className={styles.title}>{item.title}</p>
              {item.time ? (
                <time
                  className={styles.time}
                  {...(item.dateTime ? { dateTime: item.dateTime } : {})}
                >
                  {item.time}
                </time>
              ) : null}
            </div>
            {item.description ? <p className={styles.description}>{item.description}</p> : null}
            {item.meta ? <div className={styles.meta}>{item.meta}</div> : null}
          </div>
        </li>
      ))}
    </ol>
  )
})
