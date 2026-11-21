import type { ReactNode } from 'react'
import { formatInt, formatPercent } from '../lib/format'
import styles from './Bars.module.css'

export interface BarListItem {
  id: string
  label: ReactNode
  value: number
  /** Printed after the value (e.g. "12 errors"). */
  note?: ReactNode
}

/** A ranked list where each row's bar is its share of the largest value. The number is always printed. */
export function BarList({ items, label }: { items: readonly BarListItem[]; label: string }) {
  const max = Math.max(1, ...items.map((i) => i.value))
  return (
    <ul className={styles.list} aria-label={label}>
      {items.map((item) => (
        <li key={item.id} className={styles.row}>
          <div className={styles.head}>
            <span className={styles.label}>{item.label}</span>
            <span className={styles.value}>
              {formatInt(item.value)}
              {item.note ? <span className={styles.note}>{item.note}</span> : null}
            </span>
          </div>
          <span className={styles.track} aria-hidden="true">
            <span
              className={styles.fill}
              style={{ width: `${Math.max(1.5, (item.value / max) * 100)}%` }}
            />
          </span>
        </li>
      ))}
    </ul>
  )
}

export type SegmentTone = 'success' | 'info' | 'warning' | 'danger' | 'neutral'

export interface Segment {
  id: string
  label: string
  value: number
  tone: SegmentTone
}

/** One bar split into labelled parts, with a legend that carries the numbers (colour is never the only signal). */
export function StackedBar({ segments, label }: { segments: readonly Segment[]; label: string }) {
  const total = segments.reduce((sum, s) => sum + s.value, 0)
  return (
    <div className={styles.stacked}>
      <div className={styles.bar} role="img" aria-label={label}>
        {segments
          .filter((s) => s.value > 0)
          .map((s) => (
            <span
              key={s.id}
              className={`${styles.segment} ${styles[s.tone]}`}
              style={{ flexGrow: s.value }}
              title={`${s.label}: ${formatInt(s.value)}`}
            />
          ))}
      </div>
      <ul className={styles.legend}>
        {segments.map((s) => (
          <li key={s.id}>
            <span className={`${styles.dot} ${styles[s.tone]}`} aria-hidden="true" />
            <span className={styles.legendLabel}>{s.label}</span>
            <span className={styles.legendValue}>
              {formatInt(s.value)}
              <span className={styles.note}>
                {total > 0 ? formatPercent(s.value / total) : '0%'}
              </span>
            </span>
          </li>
        ))}
      </ul>
    </div>
  )
}
