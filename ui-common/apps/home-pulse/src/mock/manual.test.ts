import { describe, expect, it } from 'vitest'
import {
  ManualConflict,
  MIN,
  importCsv,
  manualLast24h,
  manualSeries,
  parseCsv,
  recordMeterTotal,
  type ManualState,
} from './manual'
import { BadRequest } from './validation'

const NOW = Date.parse('2026-11-19T12:00:00Z')
const at = (time: string) => Date.parse(`2026-11-19T${time}Z`)
const fresh = (): ManualState => ({ samples: [], totals: [] })

describe('parseCsv (mirrors CsvReadings)', () => {
  it('reads rows with a header, zones and blank lines', () => {
    expect(
      parseCsv('timestamp,watts\n\n2026-11-19T10:00:00Z,100.5\n2026-11-19T11:00:00+01:00,101\n'),
    ).toEqual([
      { ms: at('10:00:00'), watts: 100.5 },
      { ms: at('10:00:00'), watts: 101 },
    ])
  })

  it('refuses a timestamp with no zone and lists the problems line by line', () => {
    expect(() => parseCsv('2026-11-19T10:00:00,1\n2026-11-19T10:01:00Z,x\n')).toThrow(BadRequest)
    expect(() => parseCsv('2026-11-19T10:00:00,1\n2026-11-19T10:01:00Z,x\n')).toThrow(
      'line 1: the timestamp must be ISO 8601 with a zone',
    )
    expect(() => parseCsv('2026-11-19T10:01:00Z,x\n')).toThrow('line 1: watts must be a number')
    expect(() => parseCsv('2026-11-19T10:01:00Z,-3\n')).toThrow(
      'line 1: watts must be between 0 and',
    )
  })

  it('refuses an empty file', () => {
    expect(() => parseCsv('timestamp,watts\n')).toThrow('The file has no readings')
  })
})

describe('recordMeterTotal (mirrors ManualReadingsService)', () => {
  it('stores nothing for the first total, then one average-power minute per minute', () => {
    const state = fresh()
    const first = recordMeterTotal(state, { kwh: 100, atMs: at('10:00:00') }, NOW)
    expect(first).toMatchObject({ outcome: 'BASELINE', averageWatts: null, minutesStored: 0 })
    expect(state.samples).toHaveLength(0)

    const second = recordMeterTotal(state, { kwh: 100.5, atMs: at('10:30:00') }, NOW)
    expect(second).toMatchObject({
      outcome: 'RECORDED',
      intervalMinutes: 30,
      energyKwh: 0.5,
      averageWatts: 1000,
      minutesStored: 30,
      minutesRejected: 0,
    })
    expect(state.samples).toHaveLength(30)
    expect(state.samples.every((s) => s.watts === 1000)).toBe(true)
  })

  it('refuses a total that goes down or is not after the previous one, and stores nothing', () => {
    const state = fresh()
    recordMeterTotal(state, { kwh: 100, atMs: at('10:00:00') }, NOW)
    recordMeterTotal(state, { kwh: 100.5, atMs: at('10:30:00') }, NOW)
    expect(() => recordMeterTotal(state, { kwh: 100.2, atMs: at('10:45:00') }, NOW)).toThrow(
      ManualConflict,
    )
    expect(() => recordMeterTotal(state, { kwh: 101, atMs: at('10:30:00') }, NOW)).toThrow(
      'Enter readings in time order',
    )
    expect(state.samples).toHaveLength(30)
    expect(state.totals).toHaveLength(2)
  })

  it('refuses a time in the future', () => {
    expect(() => recordMeterTotal(fresh(), { kwh: 1, atMs: NOW + 60 * MIN }, NOW)).toThrow(
      'at must not be in the future',
    )
  })

  it('counts minutes older than the 30 day window as rejected rather than storing them', () => {
    const state = fresh()
    const start = NOW - 40 * 24 * 60 * MIN
    recordMeterTotal(state, { kwh: 10, atMs: start }, NOW)
    const result = recordMeterTotal(state, { kwh: 11, atMs: NOW - 60 * MIN }, NOW)
    expect(result.minutesRejected).toBeGreaterThan(0)
    expect(result.minutesStored + result.minutesRejected).toBe(result.intervalMinutes)
    expect(state.samples.every((s) => s.ms >= NOW - 30 * 24 * 60 * MIN)).toBe(true)
  })
})

describe('importCsv (mirrors the import endpoint)', () => {
  it('counts accepted, duplicate and rejected rows', () => {
    const state = fresh()
    const rows = '2026-11-19T10:00:00Z,100\n2026-11-19T10:01:00Z,101\n2020-01-01T00:00:00Z,5\n'
    expect(importCsv(state, rows, NOW)).toEqual({
      rows: 3,
      accepted: 2,
      duplicates: 0,
      rejected: 1,
    })
    expect(importCsv(state, rows, NOW)).toEqual({
      rows: 3,
      accepted: 0,
      duplicates: 2,
      rejected: 1,
    })
    expect(state.samples).toHaveLength(2)
  })
})

describe('views of manual readings', () => {
  it('chart points are the stored minutes, bucketed by resolution', () => {
    const samples = [
      { ms: at('10:00:00'), watts: 100 },
      { ms: at('10:01:00'), watts: 200 },
      { ms: at('11:00:00'), watts: 50 },
    ]
    expect(manualSeries(samples, at('09:00:00'), at('12:00:00'), 'RAW')).toHaveLength(3)
    const hourly = manualSeries(samples, at('09:00:00'), at('12:00:00'), 'ONE_HOUR')
    expect(hourly.map((p) => [p.ts, p.avgWatts, p.samples])).toEqual([
      [new Date(at('10:00:00')).toISOString(), 150, 2],
      [new Date(at('11:00:00')).toISOString(), 50, 1],
    ])
  })

  it('last 24 hours energy is the sum of the minute averages, with no hold beyond the last reading', () => {
    const state = fresh()
    recordMeterTotal(state, { kwh: 100, atMs: NOW - 90 * MIN }, NOW)
    recordMeterTotal(state, { kwh: 100.5, atMs: NOW - 60 * MIN }, NOW)
    // 0.5 kWh over the 30 minutes between the two totals: exactly those minutes, nothing held beyond the last one
    expect(manualLast24h(state.samples, NOW)).toMatchObject({
      energyKwh: 0.5,
      avgWatts: 1000,
      minutesWithData: 30,
    })
  })
})
