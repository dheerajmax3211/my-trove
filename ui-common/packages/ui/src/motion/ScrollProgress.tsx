import { m, useScroll, useSpring } from 'motion/react'
import { useReducedMotion } from '../internal/use-reduced-motion'
import { cx } from '../internal/cx'
import { MotionScope } from './MotionScope'
import styles from './ScrollProgress.module.css'

export interface ScrollProgressProps {
  /** `top` pins to the viewport top (default); `inline` fills its container, for use in a header. */
  placement?: 'top' | 'inline'
  className?: string
}

function ScrollProgressInner({ placement = 'top', className }: ScrollProgressProps) {
  const { scrollYProgress } = useScroll()
  const scaleX = useSpring(scrollYProgress, { stiffness: 220, damping: 34, restDelta: 0.001 })
  return (
    <m.div
      aria-hidden="true"
      className={cx(styles.bar, placement === 'top' && styles.top, className)}
      style={{ scaleX }}
      data-scroll-progress=""
    />
  )
}

/**
 * A thin gradient bar showing how far down the page you are. Decorative (hidden from assistive
 * tech); animates `transform: scaleX` only. Renders nothing under reduced motion.
 */
export function ScrollProgress(props: ScrollProgressProps) {
  const reduced = useReducedMotion()
  if (reduced) return null
  return (
    <MotionScope>
      <ScrollProgressInner {...props} />
    </MotionScope>
  )
}
