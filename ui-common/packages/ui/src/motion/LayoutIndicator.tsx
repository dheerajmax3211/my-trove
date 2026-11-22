import { LayoutGroup, m } from 'motion/react'
import { useId, type ReactNode } from 'react'
import { motion as motionTokens } from '@platform/tokens'
import { cx } from '../internal/cx'
import { MotionScope } from './MotionScope'
import styles from './LayoutIndicator.module.css'

/**
 * Scopes shared-layout indicators so two nav groups on one page never steal each other's pill.
 * Wrap a nav (or tab list) once; render a `LayoutIndicator` inside each item.
 */
export function IndicatorGroup({ id, children }: { id?: string; children: ReactNode }) {
  const generated = useId()
  return (
    <MotionScope>
      <LayoutGroup id={id ?? generated}>{children}</LayoutGroup>
    </MotionScope>
  )
}

export interface LayoutIndicatorProps {
  /** Render the indicator in this item. Exactly one item per group should be active. */
  active: boolean
  /** `pill` fills the item behind its label; `underline` is a bar on the bottom edge; `bar` is a rail on the inline start. */
  variant?: 'pill' | 'underline' | 'bar'
  /** Name for the shared `layoutId`. Default `indicator`. */
  name?: string
  className?: string
}

/**
 * The active-item marker for navigation and tabs. Because every item renders the same
 * `layoutId`, `motion` glides it from the old item to the new one on a spring: a shared-layout
 * transition that only moves a transform. Place it inside a `position: relative` item, behind
 * the label (it is `aria-hidden` and `pointer-events: none`).
 */
export function LayoutIndicator({
  active,
  variant = 'pill',
  name = 'indicator',
  className,
}: LayoutIndicatorProps) {
  if (!active) return null
  return (
    <m.span
      aria-hidden="true"
      layoutId={name}
      className={cx(styles.indicator, styles[variant], className)}
      transition={{ type: 'spring', ...motionTokens.spring.snappy }}
    />
  )
}
