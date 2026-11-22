import type { CSSProperties } from 'react'
import { cx } from '../internal/cx'
import { ArrowUpRightIcon } from '../internal/icons'
import { useReducedMotion } from '../internal/use-reduced-motion'
import { VisuallyHidden } from '../components/VisuallyHidden/VisuallyHidden'
import { useInView } from '../motion/use-in-view'
import styles from './BarsChart.module.css'

export interface BarsDatum {
  label: string
  /** Primary bar. */
  a: number
  /** Optional second bar of the pair. */
  b?: number
}

export interface BarsChartProps {
  data: readonly BarsDatum[]
  /** Accessible name. */
  label: string
  /** Index of the pair drawn solid (lime and lilac) with an arrow on its label. Default: the last. */
  highlight?: number
  /** Chart height in px. Default 200. */
  height?: number
  /** Text above the highlighted pair ("+12%"). */
  callout?: string
  className?: string
}

/**
 * Paired bars where everything is quiet (hatched, dim) except one highlighted pair in lime and
 * lilac. Made for the black card. Bars grow up from the baseline on scroll-in, left to right;
 * the highlighted pair lands last. Values are available as a list for assistive tech.
 */
export function BarsChart({
  data,
  label,
  highlight,
  height = 200,
  callout,
  className,
}: BarsChartProps) {
  const reduced = useReducedMotion()
  const [ref, inView] = useInView<HTMLDivElement>({ disabled: reduced, amount: 0.3 })
  const hi = highlight ?? data.length - 1
  const max = Math.max(1, ...data.flatMap((d) => [d.a, d.b ?? 0]))
  return (
    <div
      ref={ref}
      className={cx(styles.chart, className)}
      data-revealed={inView ? 'true' : 'false'}
      style={{ '--_h': `${height}px`, '--_n': data.length } as CSSProperties}
    >
      <div className={styles.plot} aria-hidden="true">
        {data.map((d, i) => {
          const active = i === hi
          return (
            <div key={d.label} className={cx(styles.group, active && styles.active)}>
              {active && callout ? <span className={styles.callout}>{callout}</span> : null}
              <div className={styles.pair}>
                <span
                  className={cx(styles.bar, styles.barA, active && styles.lime)}
                  style={
                    {
                      '--_v': d.a / max,
                      '--_delay': `${active ? data.length * 0.07 + 0.1 : i * 0.07}s`,
                    } as CSSProperties
                  }
                />
                {d.b !== undefined ? (
                  <span
                    className={cx(styles.bar, styles.barB, active && styles.lilac)}
                    style={
                      {
                        '--_v': d.b / max,
                        '--_delay': `${active ? data.length * 0.07 + 0.2 : i * 0.07 + 0.04}s`,
                      } as CSSProperties
                    }
                  />
                ) : null}
              </div>
              <span className={styles.axis}>
                {d.label}
                {active ? <ArrowUpRightIcon size={13} /> : null}
              </span>
            </div>
          )
        })}
      </div>
      <VisuallyHidden>
        <span>{label}</span>
        <ul>
          {data.map((d) => (
            <li key={d.label}>
              {d.label}: {d.a}
              {d.b !== undefined ? ` and ${d.b}` : ''}
            </li>
          ))}
        </ul>
      </VisuallyHidden>
    </div>
  )
}
