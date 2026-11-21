import { formatDateTime, formatDuration, formatWatts } from '../../../lib/format'
import type { ReadingPoint, ReadingSeries, Resolution } from '../types'

/** A reading bucket with its time parsed to epoch milliseconds. */
export interface Point {
  t: number
  avg: number
  min: number
  max: number
  samples: number
}

export interface Gap {
  /** Epoch ms. The first instant nothing was reported. */
  start: number
  end: number
  /** Where the gap sits: before the first reading, after the last one, or between two readings. */
  where: 'start' | 'middle' | 'end'
}

const BUCKET_MS: Record<Exclude<Resolution, 'RAW'>, number> = {
  ONE_MINUTE: 60_000,
  ONE_HOUR: 3_600_000,
  ONE_DAY: 86_400_000,
}
const DEFAULT_RAW_INTERVAL_MS = 10_000
/** A gap is reported once nothing arrived for this many expected intervals. */
export const GAP_FACTOR = 2.5
/** Readings arrive a little after the fact, so the very edges of the window tolerate at least this much silence. */
const MIN_EDGE_GAP_MS = 2 * 60_000

export function toPoints(points: readonly ReadingPoint[]): Point[] {
  return points
    .map((p) => ({
      t: Date.parse(p.ts),
      avg: p.avgWatts,
      min: p.minWatts,
      max: p.maxWatts,
      samples: Math.max(1, p.samples),
    }))
    .filter((p) => Number.isFinite(p.t) && Number.isFinite(p.avg))
    .sort((a, b) => a.t - b.t)
}

/** How far apart consecutive readings normally are. RAW has no fixed bucket, so it is inferred. */
export function expectedIntervalMs(resolution: Resolution, points: readonly Point[]): number {
  if (resolution !== 'RAW') return BUCKET_MS[resolution]
  if (points.length < 2) return DEFAULT_RAW_INTERVAL_MS
  const deltas = points
    .slice(1)
    .map((p, i) => p.t - (points[i]?.t ?? p.t))
    .filter((d) => d > 0)
    .sort((a, b) => a - b)
  return deltas[Math.floor(deltas.length / 2)] ?? DEFAULT_RAW_INTERVAL_MS
}

/**
 * Splits the series into runs of consecutive readings and lists the holes between them, including the
 * time before the first and after the last reading. Holes are never interpolated: the chart draws a break.
 */
export function findGaps(
  points: readonly Point[],
  from: number,
  to: number,
  intervalMs: number,
): { segments: Point[][]; gaps: Gap[] } {
  const limit = intervalMs * GAP_FACTOR
  const edgeLimit = Math.max(limit, MIN_EDGE_GAP_MS)
  const first = points[0]
  const last = points[points.length - 1]
  if (!first || !last) {
    return { segments: [], gaps: to > from ? [{ start: from, end: to, where: 'start' }] : [] }
  }
  const segments: Point[][] = [[first]]
  const gaps: Gap[] = []
  if (first.t - from > edgeLimit) gaps.push({ start: from, end: first.t, where: 'start' })
  for (let i = 1; i < points.length; i += 1) {
    const prev = points[i - 1] as Point
    const point = points[i] as Point
    if (point.t - prev.t > limit) {
      gaps.push({ start: prev.t + intervalMs, end: point.t, where: 'middle' })
      segments.push([point])
    } else {
      segments[segments.length - 1]?.push(point)
    }
  }
  if (to - last.t > edgeLimit) gaps.push({ start: last.t + intervalMs, end: to, where: 'end' })
  return { segments, gaps }
}

export interface SeriesSummary {
  count: number
  avg: number
  min: number
  max: number
  maxAt: number
  gapCount: number
  gapMs: number
}

export function summarize(points: readonly Point[], gaps: readonly Gap[]): SeriesSummary | null {
  if (points.length === 0) return null
  let weighted = 0
  let weight = 0
  let min = Infinity
  let max = -Infinity
  let maxAt = points[0]?.t ?? 0
  for (const p of points) {
    weighted += p.avg * p.samples
    weight += p.samples
    min = Math.min(min, p.min)
    if (p.max > max) {
      max = p.max
      maxAt = p.t
    }
  }
  return {
    count: points.length,
    avg: weighted / weight,
    min,
    max,
    maxAt,
    gapCount: gaps.length,
    gapMs: gaps.reduce((sum, g) => sum + (g.end - g.start), 0),
  }
}

/** A sentence a screen reader user can use instead of the picture. */
export function describeSeries(
  series: Pick<ReadingSeries, 'from' | 'to'>,
  summary: SeriesSummary | null,
  label: string,
): string {
  if (!summary) return `No power readings for the ${label}.`
  const gaps =
    summary.gapCount === 0
      ? 'No gaps in the data.'
      : `${summary.gapCount === 1 ? '1 gap' : `${summary.gapCount} gaps`} with no data, ${formatDuration(summary.gapMs / 60_000)} in total.`
  return (
    `Power for the ${label}, ${formatDateTime(series.from)} to ${formatDateTime(series.to)}. ` +
    `Average ${formatWatts(summary.avg)}, lowest ${formatWatts(summary.min)}, ` +
    `highest ${formatWatts(summary.max)} at ${formatDateTime(new Date(summary.maxAt))}. ${gaps}`
  )
}

export type TableRow =
  | {
      kind: 'data'
      start: number
      end: number
      avg: number
      min: number
      max: number
      samples: number
    }
  | { kind: 'gap'; start: number; end: number }

/**
 * Rows for the table alternative. Few readings: one row each, with a "no data" row where a gap sits.
 * Many readings: equal time slots, so the table stays short; an empty slot is a "no data" row too.
 */
export function tableRows(
  points: readonly Point[],
  gaps: readonly Gap[],
  from: number,
  to: number,
  intervalMs: number,
  maxRows = 48,
): TableRow[] {
  if (points.length === 0) return to > from ? [{ kind: 'gap', start: from, end: to }] : []
  if (points.length <= maxRows) {
    const rows: TableRow[] = points.map((p) => ({
      kind: 'data',
      start: p.t,
      end: p.t + intervalMs,
      avg: p.avg,
      min: p.min,
      max: p.max,
      samples: p.samples,
    }))
    for (const gap of gaps) rows.push({ kind: 'gap', start: gap.start, end: gap.end })
    return rows.sort((a, b) => a.start - b.start)
  }
  const slot = (to - from) / maxRows
  const rows: TableRow[] = []
  let next = 0
  for (let i = 0; i < maxRows; i += 1) {
    const start = from + i * slot
    const end = start + slot
    const inSlot: Point[] = []
    while (next < points.length && (points[next] as Point).t < end) {
      if ((points[next] as Point).t >= start) inSlot.push(points[next] as Point)
      next += 1
    }
    const previous = rows[rows.length - 1]
    const summary = summarize(inSlot, [])
    if (!summary) {
      if (previous?.kind === 'gap') previous.end = end
      else rows.push({ kind: 'gap', start, end })
      continue
    }
    rows.push({
      kind: 'data',
      start,
      end,
      avg: summary.avg,
      min: summary.min,
      max: summary.max,
      samples: inSlot.reduce((sum, p) => sum + p.samples, 0),
    })
  }
  return rows
}
