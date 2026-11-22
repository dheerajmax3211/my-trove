import { m, useMotionValue, useSpring } from 'motion/react'
import { useCallback, useRef, type PointerEvent, type ReactNode } from 'react'
import { cx } from '../internal/cx'
import { useReducedMotion } from '../internal/use-reduced-motion'
import { MotionScope } from './MotionScope'

export interface MagneticProps {
  /** How far the child follows the cursor, as a fraction of the offset. Default 0.28. */
  strength?: number
  className?: string
  children?: ReactNode
}

function MagneticInner({ strength = 0.28, className, children }: MagneticProps) {
  const ref = useRef<HTMLSpanElement>(null)
  const x = useMotionValue(0)
  const y = useMotionValue(0)
  const sx = useSpring(x, { stiffness: 320, damping: 20, mass: 0.5 })
  const sy = useSpring(y, { stiffness: 320, damping: 20, mass: 0.5 })

  const move = useCallback(
    (e: PointerEvent<HTMLSpanElement>) => {
      if (e.pointerType === 'touch') return
      const el = ref.current
      if (!el) return
      const box = el.getBoundingClientRect()
      x.set((e.clientX - (box.left + box.width / 2)) * strength)
      y.set((e.clientY - (box.top + box.height / 2)) * strength)
    },
    [strength, x, y],
  )
  const leave = useCallback(() => {
    x.set(0)
    y.set(0)
  }, [x, y])

  return (
    <m.span
      ref={ref}
      className={cx(className)}
      style={{ display: 'inline-flex', x: sx, y: sy }}
      onPointerMove={move}
      onPointerLeave={leave}
    >
      {children}
    </m.span>
  )
}

/**
 * Hover pull: the child leans toward the cursor and springs back. Wrap one button or link; the
 * wrapper adds no semantics. Not applied on touch or under reduced motion.
 */
export function Magnetic(props: MagneticProps) {
  const reduced = useReducedMotion()
  if (reduced) {
    return (
      <span className={props.className} style={{ display: 'inline-flex' }}>
        {props.children}
      </span>
    )
  }
  return (
    <MotionScope>
      <MagneticInner {...props} />
    </MotionScope>
  )
}
