import {
  Children,
  cloneElement,
  isValidElement,
  type CSSProperties,
  type ElementType,
  type HTMLAttributes,
  type ReactElement,
  type ReactNode,
} from 'react'
import { cx } from '../internal/cx'
import { useReducedMotion } from '../internal/use-reduced-motion'
import styles from './Reveal.module.css'
import { useInView, type UseInViewOptions } from './use-in-view'

export type RevealDirection = 'up' | 'down' | 'left' | 'right' | 'none'

export interface RevealOptions extends Pick<UseInViewOptions, 'once' | 'margin' | 'amount'> {
  /** Where it travels from. Default `up` (rises into place). */
  direction?: RevealDirection
  /** Travel distance in px. Default 24. */
  distance?: number
  /** Start scale, e.g. 0.96 for a soft pop. Default 1. */
  scale?: number
  /** Seconds before the entrance starts. */
  delay?: number
  /** Seconds the entrance takes. Default 0.7. */
  duration?: number
}

export interface RevealProps extends RevealOptions, HTMLAttributes<HTMLElement> {
  as?: ElementType
  children?: ReactNode
}

function offset(direction: RevealDirection, distance: number): [number, number] {
  switch (direction) {
    case 'up':
      return [0, distance]
    case 'down':
      return [0, -distance]
    case 'left':
      return [distance, 0]
    case 'right':
      return [-distance, 0]
    default:
      return [0, 0]
  }
}

function revealVars(o: RevealOptions): CSSProperties {
  const [x, y] = offset(o.direction ?? 'up', o.distance ?? 24)
  return {
    '--pp-reveal-x': `${x}px`,
    '--pp-reveal-y': `${y}px`,
    '--pp-reveal-scale': String(o.scale ?? 1),
    '--pp-reveal-delay': `${o.delay ?? 0}s`,
    '--pp-reveal-duration': `${o.duration ?? 0.7}s`,
  } as CSSProperties
}

/**
 * Fade, slide and scale an element into place when it scrolls into view. CSS-driven (opacity and
 * transform only, on the compositor); the observer only flips one attribute. Under reduced motion
 * the content is simply there.
 */
export function Reveal({
  as: Tag = 'div',
  direction,
  distance,
  scale,
  delay,
  duration,
  once,
  margin,
  amount,
  className,
  style,
  children,
  ...rest
}: RevealProps) {
  const reduced = useReducedMotion()
  const [ref, inView] = useInView<HTMLElement>({
    ...(once === undefined ? {} : { once }),
    ...(margin === undefined ? {} : { margin }),
    ...(amount === undefined ? {} : { amount }),
    disabled: reduced,
  })
  return (
    <Tag
      ref={ref}
      className={cx(styles.reveal, className)}
      data-revealed={inView ? 'true' : 'false'}
      style={{ ...revealVars({ direction, distance, scale, delay, duration }), ...style }}
      {...rest}
    >
      {children}
    </Tag>
  )
}

export interface StaggerProps extends RevealOptions, HTMLAttributes<HTMLElement> {
  as?: ElementType
  /** Seconds between each child. Default 0.07. */
  interval?: number
  children?: ReactNode
}

/**
 * Enter a group's children one after another. Each direct child gets an index; the container
 * watches the viewport once. Children keep their own element (no wrapper), so lists, grids and
 * `<li>`s stay valid; plain text children are wrapped in a span.
 */
export function Stagger({
  as: Tag = 'div',
  interval = 0.07,
  direction,
  distance,
  scale,
  delay = 0,
  duration,
  once,
  margin,
  amount,
  className,
  style,
  children,
  ...rest
}: StaggerProps) {
  const reduced = useReducedMotion()
  const [ref, inView] = useInView<HTMLElement>({
    ...(once === undefined ? {} : { once }),
    ...(margin === undefined ? {} : { margin }),
    amount: amount ?? 0.1,
    disabled: reduced,
  })
  const items = Children.toArray(children).map((child, i) => {
    const vars = { '--pp-reveal-delay': `${delay + i * interval}s` } as CSSProperties
    if (isValidElement(child)) {
      const el = child as ReactElement<{ className?: string; style?: CSSProperties }>
      return cloneElement(el, {
        className: cx(styles.item, el.props.className),
        style: { ...vars, ...el.props.style },
      })
    }
    return (
      <span key={i} className={styles.item} style={vars}>
        {child}
      </span>
    )
  })
  return (
    <Tag
      ref={ref}
      className={cx(styles.stagger, className)}
      data-revealed={inView ? 'true' : 'false'}
      style={{ ...revealVars({ direction, distance, scale, duration }), ...style }}
      {...rest}
    >
      {items}
    </Tag>
  )
}
