import { describe, expect, it } from 'vitest'
import type { ReadingPoint } from '../types'
import {
  describeSeries,
  expectedIntervalMs,
  findGaps,
  summarize,
  tableRows,
  toPoints,
  type Point,
} from './series'

const MIN = 60_000
const T0 = Date.UTC(2026, 10, 19, 10, 0)

const reading = (minute: number, avg: number, extra: Partial<ReadingPoint> = {}): ReadingPoint => ({
  ts: new Date(T0 + minute * MIN).toISOString(),
  avgWatts: avg,
  minWatts: avg,
  maxWatts: avg,
  avgVolts: null,
  avgAmps: null,
  samples: 1,
  ...extra,
})

const pts = (minutes: number[], avg = 100): Point[] => toPoints(minutes.map((m) => reading(m, avg)))

describe('toPoints', () => {
  it('parses times, sorts ascending and drops unusable entries', () => {
    const out = toPoints([
      reading(5, 50),
      reading(1, 10),
      { ...reading(2, 0), ts: 'not a date' },
      { ...reading(3, Number.NaN) },
    ])
    expect(out.map((p) => p.avg)).toEqual([10, 50])
    expect(out[0]?.t).toBe(T0 + MIN)
  })

  it('treats a missing sample count as one so weights are never zero', () => {
    expect(toPoints([reading(0, 5, { samples: 0 })])[0]?.samples).toBe(1)
  })
})

describe('expectedIntervalMs', () => {
  it('is the bucket size for aggregated series', () => {
    expect(expectedIntervalMs('ONE_MINUTE', [])).toBe(MIN)
    expect(expectedIntervalMs('ONE_HOUR', [])).toBe(3_600_000)
    expect(expectedIntervalMs('ONE_DAY', [])).toBe(86_400_000)
  })

  it('infers the spacing of raw readings from the median step, ignoring one outage', () => {
    const raw = toPoints(
      [0, 10, 20, 30, 40, 400].map((s) => ({
        ...reading(0, 1),
        ts: new Date(T0 + s * 1000).toISOString(),
      })),
    )
    expect(expectedIntervalMs('RAW', raw)).toBe(10_000)
  })

  it('falls back to 10 seconds with fewer than two raw readings', () => {
    expect(expectedIntervalMs('RAW', [])).toBe(10_000)
    expect(expectedIntervalMs('RAW', pts([0]))).toBe(10_000)
  })
})

describe('findGaps', () => {
  const from = T0
  const to = T0 + 60 * MIN

  it('finds no gaps in a complete series', () => {
    const minutes = Array.from({ length: 60 }, (_, i) => i)
    const { segments, gaps } = findGaps(pts(minutes), from, to, MIN)
    expect(gaps).toEqual([])
    expect(segments).toHaveLength(1)
    expect(segments[0]).toHaveLength(60)
  })

  it('splits the line at a hole instead of joining across it', () => {
    const { segments, gaps } = findGaps(
      pts([0, 1, 2, 3, 20, 21, 22, 23, 24, 25, 26, 27, 28, 29, 30, 58, 59]),
      from,
      to,
      MIN,
    )
    expect(segments.map((s) => s.length)).toEqual([4, 11, 2])
    expect(gaps.map((g) => g.where)).toEqual(['middle', 'middle'])
    expect(gaps[0]).toMatchObject({ start: T0 + 4 * MIN, end: T0 + 20 * MIN })
  })

  it('does not call a single late reading a gap (up to 2.5 intervals)', () => {
    const { gaps } = findGaps(
      pts([0, 2, 4, 6, 8, 10, 12, 14, 16, 18, 20]),
      from,
      T0 + 21 * MIN,
      MIN,
    )
    expect(gaps).toEqual([])
    expect(findGaps(pts([0, 1, 4]), from, T0 + 5 * MIN, MIN).gaps).toHaveLength(1)
  })

  it('reports silence before the first and after the last reading', () => {
    const { gaps } = findGaps(pts([30, 31, 32]), from, to, MIN)
    expect(gaps.map((g) => g.where)).toEqual(['start', 'end'])
    expect(gaps[0]).toMatchObject({ start: from, end: T0 + 30 * MIN })
    expect(gaps[1]?.end).toBe(to)
  })

  it('tolerates a short delay at the very edges of the window', () => {
    const { gaps } = findGaps(pts([1, 2, 3]), from, T0 + 5 * MIN, MIN)
    expect(gaps).toEqual([])
  })

  it('treats an empty series as one gap covering the whole window', () => {
    const { segments, gaps } = findGaps([], from, to, MIN)
    expect(segments).toEqual([])
    expect(gaps).toEqual([{ start: from, end: to, where: 'start' }])
  })

  it('uses the bucket size when judging hourly data', () => {
    const hour = 3_600_000
    const hourly = toPoints(
      [0, 1, 2, 6, 7].map((h) => ({ ...reading(0, 1), ts: new Date(T0 + h * hour).toISOString() })),
    )
    const { gaps } = findGaps(hourly, T0, T0 + 8 * hour, hour)
    expect(gaps.filter((g) => g.where === 'middle')).toHaveLength(1)
  })

  it('isolates a lone reading between two holes as its own run', () => {
    const { segments } = findGaps(pts([0, 1, 10, 20, 21]), from, T0 + 22 * MIN, MIN)
    expect(segments.map((s) => s.length)).toEqual([2, 1, 2])
  })
})

describe('summarize', () => {
  it('is null without readings', () => {
    expect(summarize([], [])).toBeNull()
  })

  it('weights the average by how many samples each bucket holds', () => {
    const points = toPoints([
      reading(0, 100, { samples: 1, minWatts: 90, maxWatts: 110 }),
      reading(1, 200, { samples: 3, minWatts: 150, maxWatts: 260 }),
    ])
    const s = summarize(points, [])
    expect(s?.avg).toBeCloseTo(175)
    expect(s?.min).toBe(90)
    expect(s?.max).toBe(260)
    expect(s?.maxAt).toBe(T0 + MIN)
  })

  it('totals the gaps', () => {
    const s = summarize(pts([0]), [
      { start: 0, end: 600_000, where: 'middle' },
      { start: 1_000_000, end: 1_300_000, where: 'end' },
    ])
    expect(s).toMatchObject({ gapCount: 2, gapMs: 900_000 })
  })
})

describe('describeSeries', () => {
  const series = { from: new Date(T0).toISOString(), to: new Date(T0 + 60 * MIN).toISOString() }

  it('says plainly when there is nothing to describe', () => {
    expect(describeSeries(series, null, 'last hour')).toBe('No power readings for the last hour.')
  })

  it('states average, lowest, highest and whether there were gaps', () => {
    const none = describeSeries(series, summarize(pts([0, 1], 80), []), 'last hour')
    expect(none).toContain('Power for the last hour')
    expect(none).toContain('Average 80 W')
    expect(none).toContain('No gaps in the data.')
    const some = describeSeries(
      series,
      summarize(pts([0, 1], 80), [{ start: T0, end: T0 + 25 * MIN, where: 'middle' }]),
      'last hour',
    )
    expect(some).toContain('1 gap with no data, 25 min in total.')
  })
})

describe('tableRows', () => {
  const from = T0
  const to = T0 + 60 * MIN

  it('gives one row per reading when there are few, with a no-data row at each gap', () => {
    const points = pts([0, 1, 2, 30, 31])
    const { gaps } = findGaps(points, from, to, MIN)
    const rows = tableRows(points, gaps, from, to, MIN)
    expect(rows.map((r) => r.kind)).toEqual(['data', 'data', 'data', 'gap', 'data', 'data', 'gap'])
    expect(rows.map((r) => r.start)).toEqual([...rows.map((r) => r.start)].sort((a, b) => a - b))
  })

  it('summarises many readings into equal time slots and keeps empty slots as gaps', () => {
    const minutes = [
      ...Array.from({ length: 20 }, (_, i) => i),
      ...Array.from({ length: 20 }, (_, i) => 40 + i),
    ]
    const points = toPoints(minutes.map((m) => reading(m, m < 20 ? 100 : 300)))
    const rows = tableRows(points, [], from, to, MIN, 12)
    expect(rows.length).toBeLessThanOrEqual(12)
    expect(rows.some((r) => r.kind === 'gap')).toBe(true)
    const first = rows[0]
    expect(first?.kind === 'data' && first.avg).toBe(100)
    const last = rows[rows.length - 1]
    expect(last?.kind === 'data' && last.avg).toBe(300)
  })

  it('merges neighbouring empty slots into a single no-data row', () => {
    const points = pts([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14])
    const rows = tableRows(points, [], from, to, MIN, 6)
    expect(rows.filter((r) => r.kind === 'gap')).toHaveLength(1)
  })

  it('shows one no-data row for an empty window and nothing for an empty window of zero length', () => {
    expect(tableRows([], [], from, to, MIN)).toEqual([{ kind: 'gap', start: from, end: to }])
    expect(tableRows([], [], from, from, MIN)).toEqual([])
  })
})
