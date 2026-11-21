import { forwardRef, type HTMLAttributes, type ReactNode } from 'react'
import { cx } from '../../internal/cx'
import { AlertIcon, CheckCircleIcon, InfoIcon, KeyIcon, XCircleIcon } from '../../internal/icons'
import styles from './Callout.module.css'

export type CalloutVariant = 'info' | 'success' | 'warning' | 'danger' | 'note'

export interface CalloutProps extends Omit<HTMLAttributes<HTMLDivElement>, 'title'> {
  variant?: CalloutVariant
  title?: ReactNode
  /** Replace the default glyph. Pass `null` for none. */
  icon?: ReactNode
  /** A button or link placed under the text. */
  action?: ReactNode
}

const ICONS: Record<CalloutVariant, ReactNode> = {
  info: <InfoIcon size={20} />,
  success: <CheckCircleIcon size={20} />,
  warning: <AlertIcon size={20} />,
  danger: <XCircleIcon size={20} />,
  note: <KeyIcon size={20} />,
}

/**
 * An in-page message. `danger` and `warning` use role="alert" so a callout that appears after
 * an action is announced; the rest are `role="note"`. Override with the `role` prop.
 */
export const Callout = forwardRef<HTMLDivElement, CalloutProps>(function Callout(
  { variant = 'info', title, icon, action, className, children, role, ...rest },
  ref,
) {
  const resolvedRole = role ?? (variant === 'danger' || variant === 'warning' ? 'alert' : 'note')
  const glyph = icon === undefined ? ICONS[variant] : icon
  return (
    <div
      ref={ref}
      role={resolvedRole}
      data-variant={variant}
      className={cx(styles.callout, styles[variant], className)}
      {...rest}
    >
      {glyph ? (
        <span className={styles.icon} aria-hidden="true">
          {glyph}
        </span>
      ) : null}
      <div className={styles.body}>
        {title ? <p className={styles.title}>{title}</p> : null}
        {children ? <div className={styles.content}>{children}</div> : null}
        {action ? <div className={styles.action}>{action}</div> : null}
      </div>
    </div>
  )
})
