import { forwardRef, type CSSProperties, type HTMLAttributes } from 'react'
import { cx } from '../../internal/cx'
import styles from './Skeleton.module.css'

export interface SkeletonProps extends Omit<HTMLAttributes<HTMLSpanElement>, 'children'> {
  width?: CSSProperties['width']
  height?: CSSProperties['height']
  circle?: boolean
}

/**
 * Decorative placeholder (hidden from AT). Mark the surrounding region `aria-busy="true"` and/or
 * render a <Spinner label="Loading..."> so screen reader users still learn that content is loading.
 */
export const Skeleton = forwardRef<HTMLSpanElement, SkeletonProps>(function Skeleton(
  { width = '100%', height = '1em', circle = false, className, style, ...rest },
  ref,
) {
  return (
    <span
      ref={ref}
      aria-hidden="true"
      className={cx(styles.skeleton, circle && styles.circle, className)}
      style={{ width, height, ...style }}
      {...rest}
    />
  )
})
