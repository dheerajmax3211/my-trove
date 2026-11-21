import { useId, useMemo, useState, type KeyboardEvent, type PointerEvent } from 'react'
import { formatWatts } from '../../../lib/format'
import { formatSpan, formatTick } from '../chart/labels'
import { areaPath, bandPath, isolatedPoints, linePath } from '../chart/paths'
import {
  browserOffset,
  clamp,
  linearScale,
  nearestIndex,
  niceTicks,
  timeTicks,
  type OffsetMinutes,
} from '../chart/scale'
import {
  describeSeries,
  expectedIntervalMs,
  findGaps,
  summarize,
  toPoints,
  type Point,
} from '../chart/series'
import type { ReadingSeries } from '../types'
import { ChartDataTable } from './ChartDataTable'
import styles from './PowerChart.module.css'
import { useElementWidth } from './useElementWidth'

const MARGIN = { top: 24, right: 16, bottom: 30, left: 48 }
const FALLBACK_WIDTH = 720
const PAGE_STEP = 10

export interface PowerChartProps {
  series: ReadingSeries
  /** Completes "Power for the ...", e.g. "last 24 hours". */
  rangeLabel: string
  /** The appliance's learned normal running power; drawn as a dashed reference line. */
  referenceWatts?: number | null
  /** Time zone handling for the axis, injectable for tests. */
  offset?: OffsetMinutes
}

/**
 * Hand-drawn SVG line and area chart of power draw. Holes in the data are drawn as hatched breaks, never
 * joined. The plot is one keyboard stop (a slider over the readings) so the chart never adds hundreds of tab
 * stops; the same data is available as a summary sentence and a table.
 */
export function PowerChart({
  series,
  rangeLabel,
  referenceWatts,
  offset = browserOffset,
}: PowerChartProps) {
  const uid = useId().replace(/:/g, '')
  const [frameRef, frameWidth] = useElementWidth<HTMLDivElement>(FALLBACK_WIDTH)
  const [hover, setHover] = useState<number | null>(null)
  const [cursor, setCursor] = useState<number | null>(null)
  const [focused, setFocused] = useState(false)
  const [showTable, setShowTable] = useState(false)

  const from = Date.parse(series.from)
  const to = Date.parse(series.to)
  const bucketed = series.resolution !== 'RAW'

  const data = useMemo(() => {
    const points = toPoints(series.points)
    const interval = expectedIntervalMs(series.resolution, points)
    const { segments, gaps } = findGaps(points, from, to, interval)
    return {
      points,
      times: points.map((p) => p.t),
      interval,
      segments,
      gaps,
      summary: summarize(points, gaps),
    }
  }, [series, from, to])

  const width = Math.max(280, frameWidth)
  const height = width < 480 ? 220 : 280
  const plotW = width - MARGIN.left - MARGIN.right
  const plotH = height - MARGIN.top - MARGIN.bottom

  const geometry = useMemo(() => {
    const peak = Math.max(data.summary?.max ?? 0, referenceWatts ?? 0)
    const yTicks = niceTicks(0, peak, 5)
    return {
      x: linearScale([from, to], [0, plotW]),
      y: linearScale([yTicks.min, yTicks.max], [plotH, 0]),
      yTicks: yTicks.ticks,
      xTicks: timeTicks(from, to, width < 480 ? 4 : 6, offset),
    }
  }, [data.summary, referenceWatts, from, to, plotW, plotH, width, offset])

  const { x, y } = geometry
  const lastIndex = data.points.length - 1
  const activeIndex = hover ?? cursor ?? lastIndex
  const active: Point | undefined = data.points[activeIndex]
  const tooltipVisible = active !== undefined && (hover !== null || focused)

  const readout = active
    ? `${formatSpan(active.t, active.t + data.interval, bucketed)}: average ${formatWatts(active.avg)}` +
      (bucketed ? `, lowest ${formatWatts(active.min)}, highest ${formatWatts(active.max)}` : '')
    : ''

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const targets: Record<string, number> = {
      ArrowLeft: activeIndex - 1,
      ArrowRight: activeIndex + 1,
      PageUp: activeIndex - PAGE_STEP,
      PageDown: activeIndex + PAGE_STEP,
      Home: 0,
      End: lastIndex,
    }
    const next = targets[event.key]
    if (next === undefined) return
    event.preventDefault()
    setHover(null)
    setCursor(clamp(next, 0, lastIndex))
  }
  const onPointerMove = (event: PointerEvent<HTMLDivElement>) => {
    const left = event.currentTarget.getBoundingClientRect().left
    const index = nearestIndex(data.times, x.invert(event.clientX - left))
    setHover(index < 0 ? null : index)
  }

  const flipTooltip = active ? x(active.t) > plotW / 2 : false

  return (
    <figure className={styles.figure}>
      <div ref={frameRef} className={styles.frame}>
        <svg
          className={styles.svg}
          width={width}
          height={height}
          role="img"
          aria-label={`Power draw, ${rangeLabel}`}
          aria-describedby={`${uid}-summary`}
        >
          <defs>
            <pattern
              id={`${uid}-hatch`}
              width="6"
              height="6"
              patternUnits="userSpaceOnUse"
              patternTransform="rotate(45)"
            >
              <line className={styles.hatch} x1="0" y1="0" x2="0" y2="6" />
            </pattern>
          </defs>
          <g transform={`translate(${MARGIN.left} ${MARGIN.top})`}>
            {geometry.yTicks.map((tick) => (
              <g key={tick}>
                <line className={styles.grid} x1={0} x2={plotW} y1={y(tick)} y2={y(tick)} />
                <text
                  className={styles.tickLabel}
                  x={-8}
                  y={y(tick)}
                  textAnchor="end"
                  dominantBaseline="middle"
                >
                  {tick.toLocaleString()}
                </text>
              </g>
            ))}
            <text className={styles.axisTitle} x={-MARGIN.left + 4} y={-12}>
              Watts
            </text>
            {data.gaps.map((gap) => {
              const left = clamp(x(gap.start), 0, plotW)
              return (
                <rect
                  key={`${gap.where}-${gap.start}`}
                  data-testid="chart-gap"
                  x={left}
                  y={0}
                  width={Math.max(0, clamp(x(gap.end), 0, plotW) - left)}
                  height={plotH}
                  fill={`url(#${uid}-hatch)`}
                />
              )
            })}
            {bucketed ? <path className={styles.band} d={bandPath(data.segments, x, y)} /> : null}
            <path className={styles.area} d={areaPath(data.segments, x, y, y(0))} />
            <path className={styles.line} d={linePath(data.segments, x, y)} />
            {isolatedPoints(data.segments).map((p) => (
              <circle key={p.t} className={styles.dot} cx={x(p.t)} cy={y(p.avg)} r={3} />
            ))}
            {referenceWatts ? (
              <g>
                <line
                  className={styles.reference}
                  x1={0}
                  x2={plotW}
                  y1={y(referenceWatts)}
                  y2={y(referenceWatts)}
                />
                <text
                  className={styles.referenceLabel}
                  x={plotW}
                  y={y(referenceWatts) - 4}
                  textAnchor="end"
                >
                  Learned normal, {formatWatts(referenceWatts)}
                </text>
              </g>
            ) : null}
            <line className={styles.axis} x1={0} x2={plotW} y1={plotH} y2={plotH} />
            {geometry.xTicks.ticks.map((tick) => (
              <g key={tick}>
                <line className={styles.axis} x1={x(tick)} x2={x(tick)} y1={plotH} y2={plotH + 5} />
                <text className={styles.tickLabel} x={x(tick)} y={plotH + 18} textAnchor="middle">
                  {formatTick(tick, geometry.xTicks.stepMs, to - from)}
                </text>
              </g>
            ))}
            {tooltipVisible && active ? (
              <g>
                <line
                  className={styles.cursorLine}
                  x1={x(active.t)}
                  x2={x(active.t)}
                  y1={0}
                  y2={plotH}
                />
                <circle className={styles.cursorDot} cx={x(active.t)} cy={y(active.avg)} r={5} />
              </g>
            ) : null}
          </g>
        </svg>

        {data.points.length > 0 ? (
          <div
            className={styles.overlay}
            style={{ left: MARGIN.left, top: MARGIN.top, width: plotW, height: plotH }}
            role="slider"
            tabIndex={0}
            aria-label="Chart readings. Use the arrow keys to step through, Home and End to jump."
            aria-orientation="horizontal"
            aria-valuemin={1}
            aria-valuemax={data.points.length}
            aria-valuenow={activeIndex + 1}
            aria-valuetext={readout}
            onKeyDown={onKeyDown}
            onFocus={() => setFocused(true)}
            onBlur={() => setFocused(false)}
            onPointerMove={onPointerMove}
            onPointerLeave={() => setHover(null)}
          />
        ) : null}

        {tooltipVisible && active ? (
          <div
            role="tooltip"
            className={styles.tooltip}
            style={{
              left: MARGIN.left + x(active.t),
              top: MARGIN.top + 4,
              transform: flipTooltip ? 'translateX(calc(-100% - 12px))' : 'translateX(12px)',
            }}
          >
            <div className={styles.tooltipTime}>
              {formatSpan(active.t, active.t + data.interval, bucketed)}
            </div>
            <div>
              {bucketed ? 'Average ' : ''}
              <strong>{formatWatts(active.avg)}</strong>
            </div>
            {bucketed ? (
              <div className={styles.tooltipRange}>
                {formatWatts(active.min)} to {formatWatts(active.max)}
              </div>
            ) : null}
          </div>
        ) : null}
      </div>

      <figcaption>
        <p id={`${uid}-summary`} className={styles.summary}>
          {describeSeries(series, data.summary, rangeLabel)}
        </p>
        <ul className={styles.legend} aria-label="Chart key">
          <li>
            <span className={styles.swatchLine} aria-hidden="true" /> Average power
          </li>
          {bucketed ? (
            <li>
              <span className={styles.swatchBand} aria-hidden="true" /> Lowest to highest in each
              interval
            </li>
          ) : null}
          <li>
            <span className={styles.swatchGap} aria-hidden="true" /> No data received
          </li>
        </ul>
        <button
          type="button"
          className={styles.tableToggle}
          aria-expanded={showTable}
          aria-controls={`${uid}-table`}
          onClick={() => setShowTable((open) => !open)}
        >
          {showTable ? 'Hide data table' : 'Show data table'}
        </button>
        <div id={`${uid}-table`} hidden={!showTable}>
          {showTable ? (
            <ChartDataTable
              points={data.points}
              gaps={data.gaps}
              from={from}
              to={to}
              intervalMs={data.interval}
              bucketed={bucketed}
              caption={`Power readings, ${rangeLabel}`}
            />
          ) : null}
        </div>
      </figcaption>
    </figure>
  )
}
