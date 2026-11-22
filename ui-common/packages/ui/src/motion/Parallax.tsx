import { m, useScroll, useTransform } from 'motion/react'
import { useRef, type CSSProperties, type ReactNode } from 'react'
import { useReducedMotion } from '../internal/use-reduced-motion'
import { MotionScope } from './MotionScope'

export interface ParallaxProps {
  /** Total travel in px across the element's pass through the viewport. Negative moves against the scroll. Default 60. */
  distance?: number
  axis?: 'y' | 'x'
  className?: string
  style?: CSSProperties
  children?: ReactNode
}

function ParallaxInner({ distance = 60, axis = 'y', className, style, children }: ParallaxProps) {
  const ref = useRef<HTMLDivElement>(null)
  const { scrollYProgress } = useScroll({ target: ref, offset: ['start end', 'end start'] })
  const value = useTransform(scrollYProgress, [0, 1], [-distance / 2, distance / 2])
  return (
    <m.div
      ref={ref}
      className={className}
      style={{ ...style, [axis]: value, willChange: 'transform' }}
      data-parallax=""
    >
      {children}
    </m.div>
  )
}

/**
 * Scroll-linked offset: the child drifts relative to the page as it crosses the viewport.
 * Transform only. Use for one hero image or glow, never for text. Static under reduced motion.
 */
export function Parallax(props: ParallaxProps) {
  const reduced = useReducedMotion()
  if (reduced) {
    return (
      <div className={props.className} style={props.style}>
        {props.children}
      </div>
    )
  }
  return (
    <MotionScope>
      <ParallaxInner {...props} />
    </MotionScope>
  )
}
