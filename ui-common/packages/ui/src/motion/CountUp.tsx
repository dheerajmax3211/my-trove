import { animate } from 'motion/react'
import { useEffect, useMemo, useRef, useState, type HTMLAttributes } from 'react'
import { cx } from '../internal/cx'
import { useReducedMotion } from '../internal/use-reduced-motion'
import { VisuallyHidden } from '../components/VisuallyHidden/VisuallyHidden'
import styles from './CountUp.module.css'
import { useInView } from './use-in-view'

export interface CountUpProps extends Omit<HTMLAttributes<HTMLSpanElement>, 'children'> {
  /** The number to land on. Changing it animates from the current figure. */
  value: number
  /** Where to start the first time. Default 0. */
  from?: number
  /** Seconds. Default 1.4. */
  duration?: number
  /** `Intl.NumberFormat` options (currency, percent, compact...) or a function. */
  format?: Intl.NumberFormatOptions | ((value: number) => string)
  locale?: string
  prefix?: string
  suffix?: string
  /** Wait until scrolled into view before counting. Default true. */
  startOnView?: boolean
}

/** Decimal places in a number as written (0.25 -> 2, 1200 -> 0), capped at 6. */
function decimalsOf(n: number): number {
  if (!Number.isFinite(n) || Number.isInteger(n)) return 0
  const text = String(n)
  const exp = text.match(/e-(\d+)$/)
  if (exp) return Math.min(6, Number(exp[1]))
  const dot = text.indexOf('.')
  return dot === -1 ? 0 : Math.min(6, text.length - dot - 1)
}

/**
 * The figure to show for one animation frame: rounded to the decimals of the target (or start), so a count to 12 never
 * flickers through "3.317" on its way there. Exported for tests.
 */
export function frameValue(current: number, target: number, from: number): number {
  if (current === target) return target
  const factor = 10 ** Math.max(decimalsOf(target), decimalsOf(from))
  return Math.round(current * factor) / factor
}

/**
 * An animated figure. Digits are tabular so the width never jitters; assistive tech reads the
 * final value once instead of every frame; reduced motion shows the final value immediately.
 */
export function CountUp({
  value,
  from = 0,
  duration = 1.4,
  format,
  locale,
  prefix = '',
  suffix = '',
  startOnView = true,
  className,
  ...rest
}: CountUpProps) {
  const reduced = useReducedMotion()
  const [ref, inView] = useInView<HTMLSpanElement>({ disabled: reduced || !startOnView })
  const [animated, setCurrent] = useState(reduced || !startOnView ? value : from)
  const current = reduced ? value : animated
  const last = useRef(from)

  const formatter = useMemo(
    () =>
      typeof format === 'function'
        ? format
        : (() => {
            const nf = new Intl.NumberFormat(locale, format)
            return (n: number) => nf.format(n)
          })(),
    [format, locale],
  )

  useEffect(() => {
    if (reduced || !inView) return
    const controls = animate(last.current, value, {
      duration,
      ease: [0.16, 1, 0.3, 1],
      onUpdate: (v) => {
        last.current = v
        setCurrent(v)
      },
    })
    return () => controls.stop()
  }, [value, inView, reduced, duration])

  const text = `${prefix}${formatter(frameValue(current, value, from))}${suffix}`
  const finalText = `${prefix}${formatter(value)}${suffix}`
  return (
    <span ref={ref} className={cx(styles.countUp, className)} {...rest}>
      <span aria-hidden="true">{text}</span>
      <VisuallyHidden>{finalText}</VisuallyHidden>
    </span>
  )
}
