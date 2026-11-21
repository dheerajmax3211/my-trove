import { forwardRef, type ReactNode } from 'react'
import { cx } from '../../internal/cx'
import { Button, type ButtonProps } from '../Button/Button'
import { Tooltip } from '../Tooltip/Tooltip'
import styles from './IconButton.module.css'

export interface IconButtonProps extends Omit<
  ButtonProps,
  'leftIcon' | 'rightIcon' | 'fullWidth' | 'children' | 'aria-label'
> {
  /** Required accessible name (icon-only buttons have no visible text). */
  label: string
  /** The icon. Decorative: hidden from assistive technology. */
  icon: ReactNode
  /** Also show `label` in a tooltip on hover/focus. */
  tooltip?: boolean
  round?: boolean
}

export const IconButton = forwardRef<HTMLButtonElement, IconButtonProps>(function IconButton(
  { label, icon, tooltip = false, round = false, variant = 'ghost', className, ...rest },
  ref,
) {
  const button = (
    <Button
      ref={ref}
      variant={variant}
      aria-label={label}
      className={cx(styles.iconButton, round && styles.round, className)}
      {...rest}
    >
      <span aria-hidden="true" style={{ display: 'inline-flex' }}>
        {icon}
      </span>
    </Button>
  )
  return tooltip ? <Tooltip content={label}>{button}</Tooltip> : button
})
