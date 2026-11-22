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
      { ms: at('10:00:00'), watts: 100.5, intervalMinutes: 0 },
      { ms: at('10:00:00'), watts: 101, intervalMinutes: 0 },
    ])
  })

  it('reads kWh rows as the average power over the interval since the previous row', () => {
    expect(
      parseCsv(
        'timestamp,kwh\n2026-11-19T10:00:00Z,0\n2026-11-19T10:30:00Z,0.5\n2026-11-19T10:45:00Z,0.25\n',
      ),
    ).toEqual([
      { ms: at('10:30:00'), watts: 1000, intervalMinutes: 30 },
      { ms: at('10:45:00'), watts: 1000, intervalMinutes: 15 },
    ])
  })

  it('names the columns from the header, in any order, with optional volts and amps', () => {
    expect(parseCsv('Voltage,Watts,Time\n230,50,2026-11-19T10:00:00Z\n')).toEqual([
      { ms: at('10:00:00'), watts: 50, intervalMinutes: 0 },
    ])
  })

  it('refuses headers it cannot place, with the same messages as the service', () => {
    expect(() => parseCsv('timestamp,watts,phase\n2026-11-19T10:00:00Z,1,L1\n')).toThrow(
      "unknown column 'phase'",
    )
    expect(() => parseCsv('timestamp,watts,kwh\n2026-11-19T10:00:00Z,1,1\n')).toThrow(
      'use either watts or kwh, not both',
    )
    expect(() => parseCsv('watts\n5\n')).toThrow('The header needs a timestamp column')
  })

  it('refuses a kWh interval longer than two hours and a kWh row that does not move forward', () => {
    expect(() =>
      parseCsv('timestamp,kwh\n2026-11-19T10:00:00Z,0\n2026-11-19T13:00:00Z,1\n'),
    ).toThrow('line 3: the interval since the previous row is 3 hours')
    expect(() =>
      parseCsv('timestamp,kwh\n2026-11-19T10:00:00Z,0\n2026-11-19T10:00:00Z,1\n'),
    ).toThrow('line 3: kWh rows must be later than the row before')
  })

  it('refuses a timestamp with no zone and lists the problems line by line', () => {
    expect(() => parseCsv('2026-11-19T10:00:00,1\n2026-11-19T10:01:00Z,x\n')).toThrow(BadRequest)
    expect(() => parseCsv('2026-11-19T10:00:00,1\n2026-11-19T10:01:00Z,x\n')).toThrow(
      'line 1: the timestamp has no time zone',
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
    const oldest = NOW - 30 * 24 * 60 * MIN
    recordMeterTotal(state, { kwh: 10, atMs: oldest - 60 * MIN }, NOW)
    const result = recordMeterTotal(state, { kwh: 10.2, atMs: oldest + 60 * MIN }, NOW)
    expect(result).toMatchObject({
      spread: true,
      intervalMinutes: 120,
      minutesRejected: 60,
      minutesStored: 60,
    })
    expect(state.samples.every((s) => s.ms >= oldest)).toBe(true)
  })

  it('keeps a total after a gap of more than two hours but invents no minute readings across it', () => {
    const state = fresh()
    recordMeterTotal(state, { kwh: 100, atMs: at('05:00:00') }, NOW)
    expect(recordMeterTotal(state, { kwh: 110, atMs: at('10:00:00') }, NOW)).toMatchObject({
      outcome: 'RECORDED',
      spread: false,
      intervalMinutes: 300,
      minutesStored: 0,
    })
    expect(state.samples).toHaveLength(0)
    expect(state.totals).toHaveLength(2)
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

  it('stores a kWh row as one minute reading per minute of its interval', () => {
    const state = fresh()
    const csv = 'timestamp,kwh\n2026-11-19T10:00:00Z,0\n2026-11-19T10:30:00Z,0.5\n'
    expect(importCsv(state, csv, NOW)).toEqual({
      rows: 1,
      accepted: 30,
      duplicates: 0,
      rejected: 0,
    })
    expect(state.samples.every((s) => s.watts === 1000)).toBe(true)
    expect(state.samples.at(-1)?.ms).toBe(at('10:30:00'))
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
