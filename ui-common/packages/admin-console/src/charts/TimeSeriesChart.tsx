import { VisuallyHidden } from '@platform/ui'
import {
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type KeyboardEvent,
  type PointerEvent as ReactPointerEvent,
} from 'react'
import { formatInt, formatPercent } from '../lib/format'
import type { UsageSummary } from '../lib/types'
import {
  formatAxisCount,
  formatBucketFull,
  formatBucketTick,
  niceTicks,
  tickIndices,
  type Bucket,
} from './geometry'
import styles from './TimeSeriesChart.module.css'

export interface TimeSeriesChartProps {
  buckets: readonly Bucket[]
  resolution: UsageSummary['resolution']
  /** Names the chart for assistive tech, e.g. "Requests and errors, last 24 hours". */
  label: string
}

const ERROR_STRIP = 44
const GAP = 24

/**
 * Requests as an area line, errors as bars on their own strip underneath (errors are a few percent of traffic, so on
 * a shared axis they would be invisible). Hover or focus the chart and use the arrow keys to read single buckets.
 * No chart library: the geometry is a few lines of arithmetic, tested separately.
 */
export function TimeSeriesChart({ buckets, resolution, label }: TimeSeriesChartProps) {
  const wrapRef = useRef<HTMLDivElement>(null)
  const [width, setWidth] = useState(720)
  const [active, setActive] = useState<number | null>(null)
  const gradient = useId()
  const hint = useId()

  useLayoutEffect(() => {
    const el = wrapRef.current
    if (!el) return
    const measure = () => {
      const w = Math.round(el.getBoundingClientRect().width)
      if (w > 0) setWidth(w)
    }
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(el)
    return () => observer.disconnect()
  }, [])

  const compact = width < 480
  const margin = { top: 12, right: 12, bottom: 26, left: compact ? 38 : 46 }
  const mainH = compact ? 150 : 210
  const height = margin.top + mainH + GAP + ERROR_STRIP + margin.bottom
  const innerW = Math.max(40, width - margin.left - margin.right)
  const n = buckets.length

  const maxRequests = Math.max(0, ...buckets.map((b) => b.requests))
  const maxErrors = Math.max(0, ...buckets.map((b) => b.errors))
  const yTicks = niceTicks(maxRequests, compact ? 3 : 4)
  const yTop = yTicks[yTicks.length - 1] ?? 1
  const errTop = Math.max(1, maxErrors)
  const errY0 = margin.top + mainH + GAP

  const x = (i: number) => margin.left + (n <= 1 ? innerW / 2 : (i / (n - 1)) * innerW)
  const y = (v: number) => margin.top + mainH * (1 - v / yTop)

  const line = buckets
    .map((b, i) => `${i === 0 ? 'M' : 'L'}${x(i).toFixed(1)} ${y(b.requests).toFixed(1)}`)
    .join(' ')
  const baseline = margin.top + mainH
  const area =
    n > 1 ? `${line} L${x(n - 1).toFixed(1)} ${baseline} L${x(0).toFixed(1)} ${baseline} Z` : ''
  const barW = Math.max(1.5, Math.min(14, (innerW / Math.max(n, 1)) * 0.7))
  const span = n > 1 ? (buckets[n - 1]?.t ?? 0) - (buckets[0]?.t ?? 0) : 0
  const xTicks = tickIndices(n, compact ? 3 : 6)

  const current = active === null ? null : (buckets[active] ?? null)
  const readout = current
    ? `${formatBucketFull(current.t, resolution)}: ${formatInt(current.requests)} requests, ${formatInt(current.errors)} errors`
    : ''

  const move = (index: number) => setActive(Math.min(n - 1, Math.max(0, index)))

  const onPointerMove = (event: ReactPointerEvent<SVGSVGElement>) => {
    if (n === 0) return
    const rect = event.currentTarget.getBoundingClientRect()
    if (rect.width === 0) return
    const px = ((event.clientX - rect.left) / rect.width) * width
    const ratio = (px - margin.left) / innerW
    move(Math.round(ratio * (n - 1)))
  }

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (n === 0) return
    const at = active ?? n - 1
    switch (event.key) {
      case 'ArrowLeft':
        move(at - 1)
        break
      case 'ArrowRight':
        move(at + 1)
        break
      case 'Home':
        move(0)
        break
      case 'End':
        move(n - 1)
        break
      case 'Escape':
        setActive(null)
        return
      default:
        return
    }
    event.preventDefault()
  }

  const tooltipLeft = current && active !== null ? x(active) : 0
  const flip = tooltipLeft > width * 0.62

  return (
    <div className={styles.chart}>
      <ul className={styles.legend} aria-hidden="true">
        <li>
          <span className={styles.swatchLine} /> Requests
        </li>
        <li>
          <span className={styles.swatchBar} /> Errors
        </li>
      </ul>
      <div
        ref={wrapRef}
        className={styles.frame}
        role="slider"
        tabIndex={0}
        aria-label={`${label}. Scrub through each point`}
        aria-describedby={hint}
        aria-valuemin={0}
        aria-valuemax={Math.max(0, n - 1)}
        aria-valuenow={active ?? Math.max(0, n - 1)}
        aria-valuetext={readout || `${n} points. Use the arrow keys to read one.`}
        onKeyDown={onKeyDown}
        onFocus={() => setActive((a) => a ?? (n > 0 ? n - 1 : null))}
        onBlur={() => setActive(null)}
        onPointerLeave={() => setActive(null)}
      >
        <svg
          className={styles.svg}
          width={width}
          height={height}
          viewBox={`0 0 ${width} ${height}`}
          aria-hidden="true"
          focusable="false"
          onPointerMove={onPointerMove}
          data-testid="usage-chart"
        >
          <defs>
            <linearGradient id={gradient} x1="0" x2="0" y1="0" y2="1">
              <stop offset="0" stopColor="currentColor" stopOpacity="0.24" />
              <stop offset="1" stopColor="currentColor" stopOpacity="0" />
            </linearGradient>
          </defs>

          {yTicks.map((tick) => (
            <g key={tick}>
              <line
                className={tick === 0 ? styles.axis : styles.grid}
                x1={margin.left}
                x2={width - margin.right}
                y1={y(tick)}
                y2={y(tick)}
              />
              <text
                className={styles.tick}
                x={margin.left - 8}
                y={y(tick)}
                textAnchor="end"
                dy="0.32em"
              >
                {formatAxisCount(tick)}
              </text>
            </g>
          ))}

          {n > 1 ? <path d={area} fill={`url(#${gradient})`} className={styles.requests} /> : null}
          {n > 0 ? (
            n === 1 ? (
              <circle
                cx={x(0)}
                cy={y(buckets[0]?.requests ?? 0)}
                r="3.5"
                className={styles.requestsDot}
              />
            ) : (
              <path d={line} fill="none" className={styles.requestsLine} />
            )
          ) : null}

          <text
            className={styles.tick}
            x={margin.left - 8}
            y={errY0 + ERROR_STRIP}
            textAnchor="end"
          >
            0
          </text>
          <text className={styles.tick} x={margin.left - 8} y={errY0 + 4} textAnchor="end">
            {formatAxisCount(errTop)}
          </text>
          <text className={styles.stripLabel} x={margin.left} y={errY0 - 8}>
            Errors per {resolution === '1d' ? 'day' : resolution === '1h' ? 'hour' : 'minute'}
          </text>
          <line
            className={styles.axis}
            x1={margin.left}
            x2={width - margin.right}
            y1={errY0 + ERROR_STRIP}
            y2={errY0 + ERROR_STRIP}
          />
          {buckets.map((b, i) =>
            b.errors > 0 ? (
              <rect
                key={b.t}
                className={styles.errorBar}
                x={x(i) - barW / 2}
                width={barW}
                y={errY0 + ERROR_STRIP - Math.max(2, (b.errors / errTop) * ERROR_STRIP)}
                height={Math.max(2, (b.errors / errTop) * ERROR_STRIP)}
              />
            ) : null,
          )}

          {xTicks.map((i) => (
            <text
              key={i}
              className={styles.tick}
              x={x(i)}
              y={height - 6}
              textAnchor={i === 0 ? 'start' : i === n - 1 ? 'end' : 'middle'}
            >
              {formatBucketTick(buckets[i]?.t ?? 0, resolution, span)}
            </text>
          ))}

          {current && active !== null ? (
            <g>
              <line
                className={styles.cursor}
                x1={x(active)}
                x2={x(active)}
                y1={margin.top}
                y2={errY0 + ERROR_STRIP}
              />
              <circle
                cx={x(active)}
                cy={y(current.requests)}
                r="4.5"
                className={styles.requestsDot}
              />
            </g>
          ) : null}
        </svg>

        {current && active !== null ? (
          <div
            className={styles.tooltip}
            style={{
              left: tooltipLeft,
              transform: flip ? 'translateX(calc(-100% - 12px))' : 'translateX(12px)',
            }}
            aria-hidden="true"
          >
            <p className={styles.tooltipTime}>{formatBucketFull(current.t, resolution)}</p>
            <p>
              <span className={styles.swatchLine} /> {formatInt(current.requests)} requests
            </p>
            <p>
              <span className={styles.swatchBar} /> {formatInt(current.errors)} errors
              {current.requests > 0 ? ` (${formatPercent(current.errors / current.requests)})` : ''}
            </p>
          </div>
        ) : null}
      </div>
      <p id={hint} className={styles.hint}>
        Hover the chart, or focus it and use the arrow keys, to read one point. Times are UTC.
      </p>
      <VisuallyHidden>
        <table>
          <caption>{label}, data</caption>
          <thead>
            <tr>
              <th scope="col">Time (UTC)</th>
              <th scope="col">Requests</th>
              <th scope="col">Errors</th>
            </tr>
          </thead>
          <tbody>
            {buckets.map((b) => (
              <tr key={b.t}>
                <th scope="row">{formatBucketFull(b.t, resolution)}</th>
                <td>{b.requests}</td>
                <td>{b.errors}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </VisuallyHidden>
    </div>
  )
}
