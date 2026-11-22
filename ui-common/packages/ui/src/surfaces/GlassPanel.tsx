import { forwardRef, type ElementType, type HTMLAttributes } from 'react'
import { cx } from '../internal/cx'
import styles from './GlassPanel.module.css'

export interface GlassPanelProps extends HTMLAttributes<HTMLElement> {
  as?: ElementType
  /** `soft` lets the backdrop show through; `strong` is denser, for panels that carry body text. */
  strength?: 'soft' | 'strong'
  /** Pad the content (24px). Default true. */
  padded?: boolean
  /** Add the accent halo. */
  glow?: boolean
}

/**
 * A frosted panel: translucent fill, backdrop blur, a hairline edge and a catch of light on top.
 * Needs something behind it (an `Aurora`, an image) to look like glass. Where `backdrop-filter`
 * is unsupported it falls back to a solid raised surface, so text stays legible.
 */
export const GlassPanel = forwardRef<HTMLElement, GlassPanelProps>(function GlassPanel(
  { as: Tag = 'div', strength = 'soft', padded = true, glow = false, className, ...rest },
  ref,
) {
  return (
    <Tag
      ref={ref}
      className={cx(
        styles.glass,
        strength === 'strong' && styles.strong,
        padded && styles.padded,
        glow && styles.glow,
        className,
      )}
      {...rest}
    />
  )
})
