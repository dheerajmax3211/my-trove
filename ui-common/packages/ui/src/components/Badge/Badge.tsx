import { forwardRef, type HTMLAttributes } from 'react'
import { cx } from '../../internal/cx'
import styles from './Badge.module.css'

export type BadgeVariant = 'neutral' | 'accent' | 'success' | 'warning' | 'danger' | 'info'

export interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  variant?: BadgeVariant
  /** Adds a leading status dot (color is never the only signal: the label text carries meaning). */
  dot?: boolean
}

export const Badge = forwardRef<HTMLSpanElement, BadgeProps>(function Badge(
  { variant = 'neutral', dot = false, className, children, ...rest },
  ref,
) {
  return (
    <span ref={ref} className={cx(styles.badge, styles[variant], className)} {...rest}>
      {dot ? <span className={styles.dot} aria-hidden="true" /> : null}
      {children}
    </span>
  )
})
