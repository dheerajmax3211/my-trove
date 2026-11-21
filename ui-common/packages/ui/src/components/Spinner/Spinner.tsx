import { forwardRef, type HTMLAttributes } from 'react'
import { cx } from '../../internal/cx'
import { VisuallyHidden } from '../VisuallyHidden/VisuallyHidden'
import styles from './Spinner.module.css'

export interface SpinnerProps extends Omit<HTMLAttributes<HTMLSpanElement>, 'children'> {
  /** Pixel size. Default 20. */
  size?: number
  /** Announced to screen readers. Default "Loading". */
  label?: string
  /** Purely visual (e.g. inside a button that already announces busy state). */
  decorative?: boolean
}

export const Spinner = forwardRef<HTMLSpanElement, SpinnerProps>(function Spinner(
  { size = 20, label = 'Loading', decorative = false, className, ...rest },
  ref,
) {
  return (
    <span
      ref={ref}
      className={cx(styles.spinner, className)}
      role={decorative ? undefined : 'status'}
      aria-hidden={decorative ? true : undefined}
      {...rest}
    >
      <svg
        className={styles.svg}
        width={size}
        height={size}
        viewBox="0 0 24 24"
        fill="none"
        aria-hidden="true"
      >
        <circle
          className={styles.track}
          cx="12"
          cy="12"
          r="9"
          stroke="currentColor"
          strokeWidth="3"
        />
        <path
          d="M21 12a9 9 0 0 0-9-9"
          stroke="currentColor"
          strokeWidth="3"
          strokeLinecap="round"
        />
      </svg>
      {decorative ? null : <VisuallyHidden>{label}</VisuallyHidden>}
    </span>
  )
})
