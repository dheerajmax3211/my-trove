import { m, useMotionValue, useSpring } from 'motion/react'
import {
  useCallback,
  useRef,
  type CSSProperties,
  type HTMLAttributes,
  type PointerEvent,
  type ReactNode,
} from 'react'
import { cx } from '../internal/cx'
import { useReducedMotion } from '../internal/use-reduced-motion'
import { MotionScope } from './MotionScope'
import styles from './SpotlightCard.module.css'

export interface SpotlightCardProps extends Omit<
  HTMLAttributes<HTMLDivElement>,
  'onDrag' | 'onDragStart' | 'onDragEnd' | 'onAnimationStart'
> {
  /** Maximum tilt in degrees toward the cursor. 0 turns tilt off. Default 3. */
  tilt?: number
  /** Radius of the spotlight in px. Default 320. */
  radius?: number
  /** `brass` swaps the patina light for a brass one. */
  tone?: 'accent' | 'brass' | 'lilac'
  children?: ReactNode
}

/**
 * A card with a light that follows the cursor and, optionally, a slight tilt toward it. The
 * spotlight is a CSS radial gradient driven by two custom properties (no React re-render per
 * pointer move); the tilt is a spring on transform. Touch and reduced-motion get a still card.
 */
export function SpotlightCard({
  tilt = 3,
  radius = 320,
  tone = 'accent',
  className,
  style,
  children,
  onPointerMove,
  onPointerLeave,
  ...rest
}: SpotlightCardProps) {
  const reduced = useReducedMotion()
  const ref = useRef<HTMLDivElement>(null)
  const frame = useRef(0)
  const rx = useMotionValue(0)
  const ry = useMotionValue(0)
  const springRx = useSpring(rx, { stiffness: 220, damping: 22, mass: 0.6 })
  const springRy = useSpring(ry, { stiffness: 220, damping: 22, mass: 0.6 })

  const move = useCallback(
    (event: PointerEvent<HTMLDivElement>) => {
      onPointerMove?.(event)
      if (event.pointerType === 'touch') return
      const el = ref.current
      if (!el) return
      const { clientX, clientY } = event
      cancelAnimationFrame(frame.current)
      frame.current = requestAnimationFrame(() => {
        const box = el.getBoundingClientRect()
        const x = clientX - box.left
        const y = clientY - box.top
        el.style.setProperty('--pp-mx', `${x}px`)
        el.style.setProperty('--pp-my', `${y}px`)
        if (tilt > 0 && !reduced) {
          ry.set(((x / box.width) * 2 - 1) * tilt)
          rx.set(-((y / box.height) * 2 - 1) * tilt)
        }
      })
    },
    [onPointerMove, tilt, reduced, rx, ry],
  )

  const leave = useCallback(
    (event: PointerEvent<HTMLDivElement>) => {
      onPointerLeave?.(event)
      cancelAnimationFrame(frame.current)
      rx.set(0)
      ry.set(0)
    },
    [onPointerLeave, rx, ry],
  )

  const common = {
    ref,
    className: cx(styles.card, styles[tone], className),
    style: { '--pp-spot-radius': `${radius}px`, ...style } as CSSProperties,
    onPointerMove: move,
    onPointerLeave: leave,
    ...rest,
  }

  const body = (
    <>
      <span className={styles.light} aria-hidden="true" />
      <div className={styles.content}>{children}</div>
    </>
  )

  if (reduced || tilt <= 0) return <div {...common}>{body}</div>

  const { onPointerMove: pm, onPointerLeave: pl, ref: r, ...motionRest } = common
  return (
    <MotionScope>
      <m.div
        {...(motionRest as Record<string, unknown>)}
        ref={r}
        onPointerMove={pm}
        onPointerLeave={pl}
        style={{
          ...(common.style as CSSProperties),
          rotateX: springRx,
          rotateY: springRy,
          transformPerspective: 900,
        }}
      >
        {body}
      </m.div>
    </MotionScope>
  )
}
