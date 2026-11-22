import { type CSSProperties, type HTMLAttributes, type ReactNode } from 'react'
import { cx } from '../internal/cx'
import { useReducedMotion } from '../internal/use-reduced-motion'
import styles from './Marquee.module.css'
import { useInView } from './use-in-view'

export interface MarqueeProps extends Omit<HTMLAttributes<HTMLDivElement>, 'children'> {
  children: ReactNode
  /** Seconds for one full loop. Default 36. Longer is calmer. */
  duration?: number
  reverse?: boolean
  pauseOnHover?: boolean
  /** Gap between items, in px. Default 48. */
  gap?: number
  /** Fade the strip's edges into the background. Default true. */
  fade?: boolean
}

/**
 * An infinite horizontal strip (logos, quotes, integrations). Pure CSS: one transform
 * animation on the track, paused while off-screen and on hover. The duplicate copy is
 * `aria-hidden`; under reduced motion the strip becomes a static wrapped row.
 */
export function Marquee({
  children,
  duration = 36,
  reverse = false,
  pauseOnHover = true,
  gap = 48,
  fade = true,
  className,
  style,
  ...rest
}: MarqueeProps) {
  const reduced = useReducedMotion()
  const [ref, inView] = useInView<HTMLDivElement>({ once: false, amount: 0 })
  return (
    <div
      ref={ref}
      className={cx(
        styles.marquee,
        fade && styles.fade,
        pauseOnHover && styles.pausable,
        reduced && styles.still,
        className,
      )}
      data-running={inView && !reduced ? 'true' : 'false'}
      style={
        {
          '--pp-marquee-duration': `${duration}s`,
          '--pp-marquee-gap': `${gap}px`,
          ...style,
        } as CSSProperties
      }
      {...rest}
    >
      <div className={cx(styles.track, reverse && styles.reverse)}>
        <div className={styles.group}>{children}</div>
        {reduced ? null : (
          <div className={styles.group} aria-hidden="true">
            {children}
          </div>
        )}
      </div>
    </div>
  )
}
