import { forwardRef, type ElementType, type HTMLAttributes } from 'react'
import { cx } from '../internal/cx'
import styles from './GradientBorder.module.css'

export interface GradientBorderProps extends HTMLAttributes<HTMLElement> {
  as?: ElementType
  /** Slowly sweep the highlight around the edge. Default false; off under reduced motion. */
  animated?: boolean
  /** `accent` (patina to brass) or `lilac` (electric blue to patina). */
  tone?: 'accent' | 'lilac'
}

/**
 * A one-pixel gradient hairline around any block, drawn with a masked pseudo-element so the
 * inside stays transparent and the radius is inherited. For the same effect on your own element
 * in plain CSS add the `pp-gradient-border` class.
 */
export const GradientBorder = forwardRef<HTMLElement, GradientBorderProps>(function GradientBorder(
  { as: Tag = 'div', animated = false, tone = 'accent', className, ...rest },
  ref,
) {
  return (
    <Tag
      ref={ref}
      className={cx(
        styles.frame,
        tone === 'lilac' && styles.lilac,
        animated && styles.animated,
        className,
      )}
      {...rest}
    />
  )
})
