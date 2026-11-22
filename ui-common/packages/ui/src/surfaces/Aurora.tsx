import type { CSSProperties, HTMLAttributes } from 'react'
import { cx } from '../internal/cx'
import { useReducedMotion } from '../internal/use-reduced-motion'
import { useInView } from '../motion/use-in-view'
import styles from './Aurora.module.css'

export type AuroraPalette = 'brand' | 'warm' | 'cool'
export type AuroraIntensity = 'subtle' | 'medium' | 'vivid'

export interface AuroraProps extends Omit<HTMLAttributes<HTMLDivElement>, 'children'> {
  /** `brand`: patina and emerald with a thread of brass. `warm`: brass-led. `cool`: lilac blue-led. */
  palette?: AuroraPalette
  intensity?: AuroraIntensity
  /** Fade the aurora out toward the bottom edge so it melts into the page. Default true. */
  fadeBottom?: boolean
  /** Animate slowly. Default true; always off under reduced motion and while off-screen. */
  animated?: boolean
}

/**
 * A drifting gradient mesh for hero bands and page headers. No canvas, no blur filter: four
 * radial-gradient blobs that translate and scale on the compositor. It pauses itself when it
 * scrolls out of view and stops entirely under reduced motion. Place it as the first child of a
 * `position: relative` container; it is decorative (`aria-hidden`) and ignores the pointer.
 */
export function Aurora({
  palette = 'brand',
  intensity = 'medium',
  fadeBottom = true,
  animated = true,
  className,
  style,
  ...rest
}: AuroraProps) {
  const reduced = useReducedMotion()
  const [ref, inView] = useInView<HTMLDivElement>({ once: false, amount: 0 })
  return (
    <div
      ref={ref}
      aria-hidden="true"
      className={cx(
        styles.aurora,
        styles[palette],
        styles[intensity],
        fadeBottom && styles.fadeBottom,
        className,
      )}
      data-running={animated && inView && !reduced ? 'true' : 'false'}
      style={style as CSSProperties}
      {...rest}
    >
      <span className={cx(styles.blob, styles.b1)} />
      <span className={cx(styles.blob, styles.b2)} />
      <span className={cx(styles.blob, styles.b3)} />
      <span className={cx(styles.blob, styles.b4)} />
    </div>
  )
}
