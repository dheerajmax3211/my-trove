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
  const [current, setCurrent] = useState(reduced || !startOnView ? value : from)
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
    if (reduced) {
      last.current = value
      setCurrent(value)
      return
    }
    if (!inView) return
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

  const text = `${prefix}${formatter(current)}${suffix}`
  const finalText = `${prefix}${formatter(value)}${suffix}`
  return (
    <span ref={ref} className={cx(styles.countUp, className)} {...rest}>
      <span aria-hidden="true">{text}</span>
      <VisuallyHidden>{finalText}</VisuallyHidden>
    </span>
  )
}
