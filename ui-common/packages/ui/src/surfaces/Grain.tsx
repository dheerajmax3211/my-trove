import type { CSSProperties, HTMLAttributes } from 'react'
import { cx } from '../internal/cx'
import styles from './Grain.module.css'

export interface GrainProps extends Omit<HTMLAttributes<HTMLDivElement>, 'children'> {
  /** 0..1. Default 0.07. Keep it under 0.12: grain is felt, not seen. */
  opacity?: number
}

/**
 * Film grain over a surface: breaks up gradient banding and gives dark backgrounds a printed,
 * tactile quality. A static SVG noise tile (no animation, no JS). Place it last inside a
 * `position: relative` container; it ignores the pointer and is hidden from assistive tech.
 */
export function Grain({ opacity = 0.07, className, style, ...rest }: GrainProps) {
  return (
    <div
      aria-hidden="true"
      className={cx(styles.grain, className)}
      style={{ '--pp-grain-opacity': String(opacity), ...style } as CSSProperties}
      {...rest}
    />
  )
}
