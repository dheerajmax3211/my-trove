import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from 'react'
import { cx } from '../internal/cx'
import styles from './RoundIconButton.module.css'

export interface RoundIconButtonProps extends Omit<
  ButtonHTMLAttributes<HTMLButtonElement>,
  'children' | 'aria-label'
> {
  /** Required accessible name (the button shows only an icon). */
  label: string
  icon: ReactNode
  /** `light` white chip, `dark` black chip, `lime` highlight chip, `plain` no fill. */
  tone?: 'light' | 'dark' | 'lime' | 'plain'
  size?: 'sm' | 'md' | 'lg'
  /** A small lime badge on the corner (a count, or `true` for a dot). */
  badge?: ReactNode
}

/** A circular icon button: the chip beside a card title, the bell in the header, the three-dot menu. */
export const RoundIconButton = forwardRef<HTMLButtonElement, RoundIconButtonProps>(
  function RoundIconButton(
    { label, icon, tone = 'light', size = 'md', badge, className, type = 'button', ...rest },
    ref,
  ) {
    return (
      <button
        ref={ref}
        type={type}
        aria-label={label}
        className={cx(styles.button, styles[tone], styles[size], className)}
        {...rest}
      >
        <span className={styles.icon} aria-hidden="true">
          {icon}
        </span>
        {badge ? (
          <span className={cx(styles.badge, badge === true && styles.dot)} aria-hidden="true">
            {badge === true ? null : badge}
          </span>
        ) : null}
      </button>
    )
  },
)
