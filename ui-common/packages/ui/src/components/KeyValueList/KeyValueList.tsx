import { forwardRef, type HTMLAttributes, type ReactNode } from 'react'
import { cx } from '../../internal/cx'
import styles from './KeyValueList.module.css'

export interface KeyValueItem {
  /** Stable key; falls back to the index. */
  id?: string
  label: ReactNode
  value: ReactNode
  /** Set the value in the monospace face (ids, keys, hashes). */
  mono?: boolean
  /** A note under the value. */
  hint?: ReactNode
}

export interface KeyValueListProps extends Omit<HTMLAttributes<HTMLDListElement>, 'children'> {
  items: readonly KeyValueItem[]
  /** `inline`: label and value side by side from 30rem up. `stacked`: label above value. Default inline. */
  layout?: 'inline' | 'stacked'
  /** Tighter rows for side panels. */
  dense?: boolean
  /** Hairlines between rows. Default true. */
  divided?: boolean
  /** Shown as a single muted row when `items` is empty. */
  empty?: ReactNode
}

/** A description list for facts: account details, request metadata, key properties. */
export const KeyValueList = forwardRef<HTMLDListElement, KeyValueListProps>(function KeyValueList(
  { items, layout = 'inline', dense = false, divided = true, empty, className, ...rest },
  ref,
) {
  return (
    <dl
      ref={ref}
      className={cx(
        styles.list,
        styles[layout],
        dense && styles.dense,
        divided && styles.divided,
        className,
      )}
      {...rest}
    >
      {items.length === 0 && empty ? (
        <div className={styles.row}>
          <dt className={styles.srOnly}>Empty</dt>
          <dd className={cx(styles.value, styles.empty)}>{empty}</dd>
        </div>
      ) : null}
      {items.map((item, index) => (
        <div key={item.id ?? index} className={styles.row}>
          <dt className={styles.label}>{item.label}</dt>
          <dd className={cx(styles.value, item.mono && styles.mono)}>
            {item.value}
            {item.hint ? <span className={styles.hint}>{item.hint}</span> : null}
          </dd>
        </div>
      ))}
    </dl>
  )
})
