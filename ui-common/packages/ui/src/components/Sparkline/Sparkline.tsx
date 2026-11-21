import { useId, type SVGProps } from 'react'
import { cx } from '../../internal/cx'
import { useReducedMotion } from '../../internal/use-reduced-motion'
import styles from './Sparkline.module.css'

export type SparklineTone = 'accent' | 'success' | 'danger' | 'muted' | 'brass'

export interface SparklineProps extends Omit<SVGProps<SVGSVGElement>, 'children' | 'data'> {
  data: readonly number[]
  width?: number
  height?: number
  /** Shade the area under the line. Default true. */
  area?: boolean
  /** Dot on the last point. Default true. */
  showLast?: boolean
  tone?: SparklineTone
  /** Draw the line in on mount (skipped under prefers-reduced-motion). */
  animate?: boolean
  /** Accessible description, e.g. "Requests per day, last 14 days". Omit for a decorative chart. */
  label?: string
  /** Fix the scale (otherwise the data's own min and max, padded). */
  min?: number
  max?: number
}

const PAD = 3

/** Pure geometry so it can be tested: points scaled into the drawing box. */
export function sparklinePoints(
  data: readonly number[],
  width: number,
  height: number,
  min?: number,
  max?: number,
): [number, number][] {
  const values = data.filter((v) => Number.isFinite(v))
  if (values.length === 0) return []
  const lo = min ?? Math.min(...values)
  const hi = max ?? Math.max(...values)
  const span = hi - lo
  const innerW = width - PAD * 2
  const innerH = height - PAD * 2
  return values.map((v, i) => {
    const x = values.length === 1 ? width / 2 : PAD + (i / (values.length - 1)) * innerW
    const t = span === 0 ? 0.5 : (v - lo) / span
    const y = PAD + (1 - Math.min(1, Math.max(0, t))) * innerH
    return [Number(x.toFixed(2)), Number(y.toFixed(2))]
  })
}

/** A word-sized trend line. No axes, no tooltips: it shows shape, the number next to it shows value. */
export function Sparkline({
  data,
  width = 120,
  height = 32,
  area = true,
  showLast = true,
  tone = 'accent',
  animate = false,
  label,
  min,
  max,
  className,
  ...rest
}: SparklineProps) {
  const reduced = useReducedMotion()
  const gradientId = useId()
  const points = sparklinePoints(data, width, height, min, max)
  const decorative = !label
  const line = points.map(([x, y], i) => `${i === 0 ? 'M' : 'L'}${x} ${y}`).join(' ')
  const last = points[points.length - 1]
  const first = points[0]
  const areaPath =
    first && last ? `${line} L${last[0]} ${height - PAD} L${first[0]} ${height - PAD} Z` : ''

  return (
    <svg
      role={decorative ? undefined : 'img'}
      aria-hidden={decorative ? true : undefined}
      aria-label={label}
      focusable="false"
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      data-animate={animate && !reduced ? 'true' : undefined}
      className={cx(styles.sparkline, styles[tone], className)}
      {...rest}
    >
      {points.length > 1 && area ? (
        <>
          <defs>
            <linearGradient id={gradientId} x1="0" x2="0" y1="0" y2="1">
              <stop offset="0" stopColor="currentColor" stopOpacity="0.22" />
              <stop offset="1" stopColor="currentColor" stopOpacity="0" />
            </linearGradient>
          </defs>
          <path d={areaPath} fill={`url(#${gradientId})`} stroke="none" className={styles.area} />
        </>
      ) : null}
      {points.length > 1 ? (
        <path
          d={line}
          fill="none"
          stroke="currentColor"
          strokeWidth="1.75"
          strokeLinecap="round"
          strokeLinejoin="round"
          pathLength={1}
          className={styles.line}
        />
      ) : null}
      {showLast && last ? (
        <circle cx={last[0]} cy={last[1]} r="2.75" className={styles.dot} />
      ) : null}
    </svg>
  )
}
