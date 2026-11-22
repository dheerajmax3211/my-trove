import type { CSSProperties, HTMLAttributes } from 'react'
import { cx } from '../internal/cx'
import styles from './GridGlow.module.css'

export interface GridGlowProps extends Omit<HTMLAttributes<HTMLDivElement>, 'children'> {
  /** Cell size in px. Default 56. */
  size?: number
  /** Where the grid is visible: a `spot` at the top centre, `top` fading downward, or `full`. */
  fade?: 'spot' | 'top' | 'full'
  /** Add a soft accent glow at the top of the grid. Default true. */
  glow?: boolean
}

/**
 * A hairline grid that fades out toward the edges, with an optional accent glow: the blueprint
 * floor behind a hero or an empty state. Static and cheap (two gradients and a mask). Decorative.
 */
export function GridGlow({
  size = 56,
  fade = 'spot',
  glow = true,
  className,
  style,
  ...rest
}: GridGlowProps) {
  return (
    <div
      aria-hidden="true"
      className={cx(styles.grid, styles[fade], glow && styles.glow, className)}
      style={{ '--pp-grid-size': `${size}px`, ...style } as CSSProperties}
      {...rest}
    />
  )
}
