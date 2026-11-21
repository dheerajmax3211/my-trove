import { Slot } from 'radix-ui'
import { forwardRef, type ButtonHTMLAttributes, type MouseEvent, type ReactNode } from 'react'
import { cx } from '../../internal/cx'
import { Spinner } from '../Spinner/Spinner'
import styles from './Button.module.css'

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger'
export type ButtonSize = 'sm' | 'md' | 'lg'

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant
  size?: ButtonSize
  /**
   * Shows a spinner and sets aria-busy. The button stays focusable (aria-disabled, not
   * `disabled`) so keyboard focus is not lost mid-action; clicks are ignored while loading.
   */
  loading?: boolean
  leftIcon?: ReactNode
  rightIcon?: ReactNode
  fullWidth?: boolean
  /** Render as the child element (e.g. a router link) instead of a <button>. */
  asChild?: boolean
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  {
    variant = 'primary',
    size = 'md',
    loading = false,
    leftIcon,
    rightIcon,
    fullWidth = false,
    asChild = false,
    className,
    children,
    onClick,
    disabled,
    type = 'button',
    ...rest
  },
  ref,
) {
  const classes = cx(
    styles.button,
    styles[variant],
    size !== 'md' && styles[size],
    fullWidth && styles.fullWidth,
    className,
  )

  const handleClick = (event: MouseEvent<HTMLButtonElement>) => {
    if (loading) {
      event.preventDefault()
      return
    }
    onClick?.(event)
  }

  if (asChild) {
    return (
      <Slot.Root
        ref={ref}
        className={classes}
        onClick={handleClick}
        aria-disabled={disabled || loading || undefined}
        {...rest}
      >
        {children}
      </Slot.Root>
    )
  }

  return (
    <button
      ref={ref}
      type={type}
      className={classes}
      disabled={disabled}
      aria-busy={loading || undefined}
      aria-disabled={loading || undefined}
      onClick={handleClick}
      {...rest}
    >
      {loading ? (
        <Spinner decorative size={size === 'lg' ? 20 : 16} className={styles.icon} />
      ) : leftIcon ? (
        <span className={styles.icon} aria-hidden="true">
          {leftIcon}
        </span>
      ) : null}
      {children}
      {rightIcon && !loading ? (
        <span className={styles.icon} aria-hidden="true">
          {rightIcon}
        </span>
      ) : null}
    </button>
  )
})
