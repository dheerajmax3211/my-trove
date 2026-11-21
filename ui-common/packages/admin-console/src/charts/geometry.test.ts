import { describe, expect, it } from 'vitest'
import { fillSeries, formatAxisCount, niceTicks, tickIndices } from './geometry'

describe('fillSeries', () => {
  it('adds empty buckets between points so an outage is drawn as zero, not as a straight line', () => {
    const buckets = fillSeries(
      [
        { ts: '2026-11-21T10:00:00Z', requests: 10, errors: 1 },
        { ts: '2026-11-21T13:00:00Z', requests: 7, errors: 0 },
      ],
      '1h',
      '2026-11-21T10:00:00Z',
      '2026-11-21T13:30:00Z',
    )
    expect(buckets.map((b) => b.requests)).toEqual([10, 0, 0, 7])
    expect(buckets[0]?.errors).toBe(1)
  })

  it('pads the edges of the range with zeros', () => {
    const buckets = fillSeries(
      [{ ts: '2026-11-21T11:00:00Z', requests: 5, errors: 0 }],
      '1h',
      '2026-11-21T10:20:00Z',
      '2026-11-21T12:10:00Z',
    )
    expect(buckets.map((b) => b.requests)).toEqual([0, 5, 0])
  })

  it('falls back to the given points when the range is absurdly large', () => {
    const buckets = fillSeries(
      [{ ts: '2026-11-21T11:00:00Z', requests: 5, errors: 0 }],
      '1m',
      '2020-01-01T00:00:00Z',
      '2026-11-21T00:00:00Z',
    )
    expect(buckets).toHaveLength(1)
  })
})

describe('niceTicks', () => {
  it('starts at zero and ends at or above the maximum, on round numbers', () => {
    expect(niceTicks(87, 4)).toEqual([0, 25, 50, 75, 100])
    expect(niceTicks(1000, 4)).toEqual([0, 250, 500, 750, 1000])
    const ticks = niceTicks(1234, 4)
    expect(ticks[0]).toBe(0)
    expect(ticks[ticks.length - 1]).toBeGreaterThanOrEqual(1234)
  })

  it('copes with nothing to draw', () => {
    expect(niceTicks(0)).toEqual([0, 1])
  })
})

describe('axis helpers', () => {
  it('abbreviates large counts', () => {
    expect(formatAxisCount(950)).toBe('950')
    expect(formatAxisCount(2500)).toBe('2.5k')
    expect(formatAxisCount(3_000_000)).toBe('3M')
  })

  it('spreads tick indices evenly and keeps both ends', () => {
    expect(tickIndices(3, 6)).toEqual([0, 1, 2])
    const idx = tickIndices(25, 5)
    expect(idx[0]).toBe(0)
    expect(idx[idx.length - 1]).toBe(24)
    expect(idx).toHaveLength(5)
  })
})
