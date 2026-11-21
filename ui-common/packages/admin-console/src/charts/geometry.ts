import type { SeriesPoint, UsageSummary } from '../lib/types'

export interface Bucket {
  /** Bucket start, epoch milliseconds. */
  t: number
  requests: number
  errors: number
}

export const STEP_MS: Record<UsageSummary['resolution'], number> = {
  '1m': 60_000,
  '1h': 3_600_000,
  '1d': 86_400_000,
}

const MAX_BUCKETS = 2000

/**
 * The API returns one point per bucket that saw traffic. A chart that joins those points would draw a straight line
 * across an outage, so every empty bucket between `from` and `to` is added with zero requests.
 */
export function fillSeries(
  series: readonly SeriesPoint[],
  resolution: UsageSummary['resolution'],
  from: string,
  to: string,
): Bucket[] {
  const step = STEP_MS[resolution] ?? STEP_MS['1h']
  const known = new Map<number, SeriesPoint>()
  for (const p of series) {
    const t = Date.parse(p.ts)
    if (Number.isFinite(t)) known.set(Math.floor(t / step) * step, p)
  }
  const start = Math.floor(Date.parse(from) / step) * step
  const end = Math.floor(Date.parse(to) / step) * step
  if (
    !Number.isFinite(start) ||
    !Number.isFinite(end) ||
    end < start ||
    (end - start) / step > MAX_BUCKETS
  ) {
    return [...known.entries()]
      .sort((a, b) => a[0] - b[0])
      .map(([t, p]) => ({ t, requests: p.requests, errors: p.errors }))
  }
  const out: Bucket[] = []
  for (let t = start; t <= end; t += step) {
    const p = known.get(t)
    out.push({ t, requests: p?.requests ?? 0, errors: p?.errors ?? 0 })
  }
  return out
}

/** Round-number axis ticks from 0 to just above `max` (1, 2, 2.5, 5 times a power of ten). */
export function niceTicks(max: number, count = 4): number[] {
  if (!Number.isFinite(max) || max <= 0) return [0, 1]
  const rough = max / count
  const pow = 10 ** Math.floor(Math.log10(rough))
  const fraction = rough / pow
  const nice =
    fraction <= 1 ? 1 : fraction <= 2 ? 2 : fraction <= 2.5 ? 2.5 : fraction <= 5 ? 5 : 10
  const step = nice * pow
  const ticks: number[] = []
  for (let v = 0; v < max + step; v += step) {
    ticks.push(Number(v.toFixed(6)))
    if (v >= max) break
  }
  return ticks
}

export function formatAxisCount(n: number): string {
  if (n >= 1_000_000) return `${trim(n / 1_000_000)}M`
  if (n >= 1_000) return `${trim(n / 1_000)}k`
  return String(n)
}
const trim = (n: number) => String(Number(n.toFixed(1)))

const TIME = new Intl.DateTimeFormat('en-GB', {
  hour: '2-digit',
  minute: '2-digit',
  timeZone: 'UTC',
})
const DAY = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' })
const FULL = new Intl.DateTimeFormat('en-GB', {
  day: 'numeric',
  month: 'short',
  hour: '2-digit',
  minute: '2-digit',
  timeZone: 'UTC',
})

/** Axis label for a bucket. Times are UTC, which is how the platform buckets them. */
export function formatBucketTick(
  t: number,
  resolution: UsageSummary['resolution'],
  spanMs: number,
): string {
  if (resolution === '1d') return DAY.format(t)
  return spanMs > 36 * 3_600_000 ? FULL.format(t) : TIME.format(t)
}

export function formatBucketFull(t: number, resolution: UsageSummary['resolution']): string {
  return resolution === '1d' ? DAY.format(t) : `${FULL.format(t)} UTC`
}

/** Evenly spread indices for x-axis labels. */
export function tickIndices(length: number, count: number): number[] {
  if (length <= 0) return []
  if (length <= count) return Array.from({ length }, (_, i) => i)
  const out: number[] = []
  for (let i = 0; i < count; i++) out.push(Math.round((i * (length - 1)) / (count - 1)))
  return [...new Set(out)]
}
