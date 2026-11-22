import { useEffect, useId, useRef, useState, type PointerEvent } from 'react'
import { cx } from '../internal/cx'
import { useReducedMotion } from '../internal/use-reduced-motion'
import { useInView } from '../motion/use-in-view'
import { VisuallyHidden } from '../components/VisuallyHidden/VisuallyHidden'
import styles from './AreaChart.module.css'
import { toneColor, type ChartTone } from './tone'

export interface AreaPoint {
  label: string
  value: number
}

export interface AreaChartProps {
  data: readonly AreaPoint[]
  /** Accessible name, e.g. "Monthly spending, last 12 months". */
  label: string
  /** Drawing height in px; the width follows the container. Default 220. */
  height?: number
  tone?: ChartTone
  /** Format values in the tooltip and summary. Default: locale number. */
  format?: (value: number) => string
  /** Horizontal grid lines. Default 4. */
  gridLines?: number
  /** Show first, middle and last x labels. Default true. */
  showAxis?: boolean
  className?: string
}

const PAD = { top: 16, right: 6, bottom: 6, left: 6 }

/** Smooth monotone path through the points (no overshoot between samples). */
export function smoothPath(points: readonly [number, number][]): string {
  if (points.length === 0) return ''
  if (points.length === 1) return `M${points[0]![0]},${points[0]![1]}`
  const n = points.length
  const dx: number[] = []
  const slope: number[] = []
  for (let i = 0; i < n - 1; i++) {
    const a = points[i]!
    const b = points[i + 1]!
    dx.push(b[0] - a[0])
    slope.push((b[1] - a[1]) / (b[0] - a[0] || 1))
  }
  const tangent: number[] = [slope[0]!]
  for (let i = 1; i < n - 1; i++) {
    const s0 = slope[i - 1]!
    const s1 = slope[i]!
    tangent.push(s0 * s1 <= 0 ? 0 : (s0 + s1) / 2)
  }
  tangent.push(slope[n - 2]!)
  let d = `M${points[0]![0]},${points[0]![1]}`
  for (let i = 0; i < n - 1; i++) {
    const a = points[i]!
    const b = points[i + 1]!
    const h = dx[i]! / 3
    d += ` C${(a[0] + h).toFixed(2)},${(a[1] + tangent[i]! * h).toFixed(2)} ${(b[0] - h).toFixed(2)},${(b[1] - tangent[i + 1]! * h).toFixed(2)} ${b[0]},${b[1]}`
  }
  return d
}

/**
 * An area chart that draws itself in when scrolled into view: the line traces left to right and
 * the fill fades up. Hover or touch shows the nearest value. Plain SVG, no dependencies. Under
 * reduced motion it is simply drawn.
 */
export function AreaChart({
  data,
  label,
  height = 220,
  tone = 'ink',
  format = (v) => v.toLocaleString(),
  gridLines = 4,
  showAxis = true,
  className,
}: AreaChartProps) {
  const reduced = useReducedMotion()
  const [ref, inView] = useInView<HTMLDivElement>({ disabled: reduced, amount: 0.25 })
  const [active, setActive] = useState<number | null>(null)
  const [W, setW] = useState(640)
  const box = useRef<HTMLDivElement | null>(null)
  useEffect(() => {
    const el = box.current
    if (!el || typeof ResizeObserver === 'undefined') return
    const ro = new ResizeObserver(([entry]) => {
      const w = Math.round(entry?.contentRect.width ?? 0)
      if (w > 40) setW(w)
    })
    ro.observe(el)
    return () => ro.disconnect()
  }, [])
  const gradientId = useId()

  const values = data.map((d) => d.value)
  const lo = Math.min(0, ...values)
  const hi = Math.max(...values, 1)
  const span = hi - lo || 1
  const innerW = W - PAD.left - PAD.right
  const innerH = height - PAD.top - PAD.bottom
  const points: [number, number][] = data.map((d, i) => [
    Number(
      (PAD.left + (data.length === 1 ? innerW / 2 : (i / (data.length - 1)) * innerW)).toFixed(2),
    ),
    Number((PAD.top + (1 - (d.value - lo) / span) * innerH).toFixed(2)),
  ])
  const line = smoothPath(points)
  const baseline = PAD.top + innerH
  const area =
    points.length > 1
      ? `${line} L${points[points.length - 1]![0]},${baseline} L${points[0]![0]},${baseline} Z`
      : ''

  const onMove = (e: PointerEvent<SVGSVGElement>) => {
    const box = e.currentTarget.getBoundingClientRect()
    const x = ((e.clientX - box.left) / box.width) * W
    let best = 0
    let dist = Infinity
    points.forEach((p, i) => {
      const dd = Math.abs(p[0] - x)
      if (dd < dist) {
        dist = dd
        best = i
      }
    })
    setActive(best)
  }

  const activePoint = active === null ? null : points[active]
  const color = toneColor(tone)
  const fillColor = tone === 'ink' ? toneColor('lilac') : color
  const latest = data[data.length - 1]
  const summary = latest
    ? `${label}. ${data.length} points from ${data[0]!.label} to ${latest.label}. Latest ${format(latest.value)}, low ${format(Math.min(...values))}, high ${format(Math.max(...values))}.`
    : label

  return (
    <div
      ref={(node) => {
        box.current = node
        ref(node)
      }}
      className={cx(styles.chart, className)}
      data-revealed={inView ? 'true' : 'false'}
      style={{ ['--_tone' as string]: color }}
    >
      <svg
        viewBox={`0 0 ${W} ${height}`}
        role="img"
        aria-label={summary}
        className={styles.svg}
        onPointerMove={onMove}
        onPointerLeave={() => setActive(null)}
      >
        <defs>
          <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={fillColor} stopOpacity="0.55" />
            <stop offset="100%" stopColor={fillColor} stopOpacity="0" />
          </linearGradient>
        </defs>
        {Array.from({ length: gridLines + 1 }, (_, i) => {
          const y = PAD.top + (i / gridLines) * innerH
          return (
            <line key={i} x1={PAD.left} x2={W - PAD.right} y1={y} y2={y} className={styles.grid} />
          )
        })}
        {area ? <path d={area} fill={`url(#${gradientId})`} className={styles.fill} /> : null}
        <path d={line} pathLength={1} className={styles.line} />
        {activePoint ? (
          <g className={styles.hover}>
            <line
              x1={activePoint[0]}
              x2={activePoint[0]}
              y1={PAD.top}
              y2={baseline}
              className={styles.cursor}
            />
            <circle cx={activePoint[0]} cy={activePoint[1]} r="9" className={styles.halo} />
            <circle cx={activePoint[0]} cy={activePoint[1]} r="4.5" className={styles.dot} />
          </g>
        ) : null}
      </svg>
      {showAxis && data.length > 1 ? (
        <div className={styles.axisRow} aria-hidden="true">
          <span>{data[0]!.label}</span>
          <span>{data[Math.floor((data.length - 1) / 2)]!.label}</span>
          <span>{data[data.length - 1]!.label}</span>
        </div>
      ) : null}
      {active !== null && activePoint ? (
        <div
          className={styles.tooltip}
          style={{ left: `${(activePoint[0] / W) * 100}%` }}
          aria-hidden="true"
        >
          <span className={styles.tipLabel}>{data[active]!.label}</span>
          <span className={styles.tipValue}>{format(data[active]!.value)}</span>
        </div>
      ) : null}
      <VisuallyHidden>
        <ul>
          {data.map((d) => (
            <li key={d.label}>
              {d.label}: {format(d.value)}
            </li>
          ))}
        </ul>
      </VisuallyHidden>
    </div>
  )
}
