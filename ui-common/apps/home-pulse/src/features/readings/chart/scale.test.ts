import { describe, expect, it } from 'vitest'
import {
  clamp,
  linearScale,
  nearestIndex,
  niceNumber,
  niceTicks,
  timeTicks,
  TIME_STEPS_MS,
} from './scale'

const utc = () => 0
const MIN = 60_000
const HOUR = 60 * MIN
const DAY = 24 * HOUR

describe('linearScale', () => {
  it('maps the domain onto the range and back', () => {
    const x = linearScale([100, 200], [0, 500])
    expect(x(100)).toBe(0)
    expect(x(150)).toBe(250)
    expect(x(200)).toBe(500)
    expect(x.invert(250)).toBe(150)
  })

  it('supports an inverted range, as the y axis needs (0 at the bottom)', () => {
    const y = linearScale([0, 100], [200, 0])
    expect(y(0)).toBe(200)
    expect(y(100)).toBe(0)
    expect(y(25)).toBe(150)
  })

  it('extrapolates outside the domain instead of clamping', () => {
    expect(linearScale([0, 10], [0, 100])(20)).toBe(200)
  })

  it('puts everything in the middle of the range when the domain has no width', () => {
    const x = linearScale([5, 5], [0, 100])
    expect(x(5)).toBe(50)
    expect(x(999)).toBe(50)
  })

  it('returns the domain start when inverting a zero-width range', () => {
    expect(linearScale([3, 9], [10, 10]).invert(10)).toBe(3)
  })
})

describe('niceNumber', () => {
  it.each([
    [0.9, true, 1],
    [1.4, true, 1],
    [2.2, true, 2],
    [4.9, true, 5],
    [8, true, 10],
    [11, false, 20],
    [350, false, 500],
    [0.034, false, 0.05],
  ])('niceNumber(%s, round=%s) is %s', (value, round, expected) => {
    expect(niceNumber(value, round)).toBeCloseTo(expected)
  })

  it('falls back to 1 for values that cannot be scaled', () => {
    expect(niceNumber(0, true)).toBe(1)
    expect(niceNumber(-4, false)).toBe(1)
    expect(niceNumber(Number.NaN, true)).toBe(1)
  })
})

describe('niceTicks', () => {
  it('covers a typical power range with round steps', () => {
    const t = niceTicks(0, 137, 5)
    expect(t.ticks).toEqual([0, 50, 100, 150])
    expect(t.min).toBe(0)
    expect(t.max).toBe(150)
    expect(t.step).toBe(50)
  })

  it('never returns more ticks than asked for plus one, and always covers the data', () => {
    for (const max of [0.7, 3, 9.5, 42, 118, 999, 1063, 2400, 18000]) {
      const t = niceTicks(0, max, 5)
      expect(t.ticks.length).toBeLessThanOrEqual(7)
      expect(t.max).toBeGreaterThanOrEqual(max)
      expect(t.min).toBeLessThanOrEqual(0)
    }
  })

  it('uses fractional steps for small values without floating point noise', () => {
    const t = niceTicks(0, 0.7, 5)
    expect(t.ticks).toEqual([0, 0.2, 0.4, 0.6, 0.8])
  })

  it('gives a usable axis when there is no spread (all zero, or one value)', () => {
    expect(niceTicks(0, 0, 5).ticks.length).toBeGreaterThan(1)
    const flat = niceTicks(50, 50, 5)
    expect(flat.min).toBeLessThanOrEqual(50)
    expect(flat.max).toBeGreaterThan(50)
  })

  it('accepts min and max in either order', () => {
    expect(niceTicks(100, 0, 5)).toEqual(niceTicks(0, 100, 5))
  })

  it('handles negative lower bounds', () => {
    const t = niceTicks(-20, 80, 5)
    expect(t.min).toBeLessThanOrEqual(-20)
    expect(t.ticks).toContain(0)
  })
})

describe('timeTicks', () => {
  it('puts hourly ticks on the hour for a 6 hour window', () => {
    const from = Date.UTC(2026, 10, 19, 6, 20)
    const to = Date.UTC(2026, 10, 19, 12, 20)
    const { ticks, stepMs } = timeTicks(from, to, 7, utc)
    expect(stepMs).toBe(HOUR)
    expect(ticks.map((t) => new Date(t).toISOString())).toEqual([
      '2026-11-19T07:00:00.000Z',
      '2026-11-19T08:00:00.000Z',
      '2026-11-19T09:00:00.000Z',
      '2026-11-19T10:00:00.000Z',
      '2026-11-19T11:00:00.000Z',
      '2026-11-19T12:00:00.000Z',
    ])
  })

  it('uses 10 minute ticks for an hour', () => {
    const from = Date.UTC(2026, 10, 19, 11, 0)
    const { ticks, stepMs } = timeTicks(from, from + HOUR, 7, utc)
    expect(stepMs).toBe(10 * MIN)
    expect(ticks).toHaveLength(7)
    expect(ticks[0]).toBe(from)
  })

  it('picks a coarser step as the window grows and stays within the tick budget', () => {
    const from = Date.UTC(2026, 10, 1)
    let previous = 0
    for (const span of [HOUR, 6 * HOUR, DAY, 7 * DAY, 30 * DAY, 90 * DAY]) {
      const { ticks, stepMs } = timeTicks(from, from + span, 6, utc)
      expect(stepMs).toBeGreaterThanOrEqual(previous)
      expect(ticks.length).toBeLessThanOrEqual(7)
      previous = stepMs
    }
  })

  it('aligns day ticks to local midnight for a zone ahead of UTC (UTC+5:30)', () => {
    const offset = () => -330 // getTimezoneOffset: minutes to ADD to local time to get UTC
    const from = Date.UTC(2026, 10, 1, 0, 0)
    const { ticks, stepMs } = timeTicks(from, from + 7 * DAY, 8, offset)
    expect(stepMs).toBe(DAY)
    for (const t of ticks) expect(new Date(t + 330 * MIN).getUTCHours()).toBe(0)
  })

  it('keeps ticks on local midnight across a daylight saving change', () => {
    // A zone that is UTC-5 before the instant below and UTC-4 after it.
    const change = Date.UTC(2026, 2, 8, 7)
    const offset = (utcMs: number) => (utcMs < change ? 300 : 240)
    const from = Date.UTC(2026, 2, 6, 12)
    const { ticks } = timeTicks(from, from + 5 * DAY, 8, offset)
    const localHours = ticks.map((t) => new Date(t - offset(t) * MIN).getUTCHours())
    expect(localHours.length).toBeGreaterThan(2)
    expect(new Set(localHours)).toEqual(new Set([0]))
  })

  it('returns no ticks and does not hang for an empty or reversed window', () => {
    const t = Date.UTC(2026, 10, 19, 12)
    expect(timeTicks(t, t, 6, utc).ticks.length).toBeLessThanOrEqual(1)
    expect(timeTicks(t, t - HOUR, 6, utc).ticks).toEqual([])
  })

  it('offers steps in strictly increasing order', () => {
    expect([...TIME_STEPS_MS].sort((a, b) => a - b)).toEqual([...TIME_STEPS_MS])
  })
})

describe('nearestIndex', () => {
  const xs = [10, 20, 40, 80]
  it.each([
    [-5, 0],
    [10, 0],
    [14, 0],
    [16, 1],
    [30, 1],
    [31, 2],
    [79, 3],
    [500, 3],
  ])('target %s is closest to index %s', (target, expected) => {
    expect(nearestIndex(xs, target)).toBe(expected)
  })

  it('returns -1 for no values and 0 for a single one', () => {
    expect(nearestIndex([], 5)).toBe(-1)
    expect(nearestIndex([7], 1000)).toBe(0)
  })
})

describe('clamp', () => {
  it('limits a value to the range', () => {
    expect(clamp(5, 0, 3)).toBe(3)
    expect(clamp(-1, 0, 3)).toBe(0)
    expect(clamp(2, 0, 3)).toBe(2)
  })
})
