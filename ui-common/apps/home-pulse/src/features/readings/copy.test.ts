import { describe, expect, it } from 'vitest'
import { describeImport, describeMeterResult, sourceSentence } from './copy'
import type { MeterReadingResult } from './types'

const recorded: MeterReadingResult = {
  outcome: 'RECORDED',
  at: '2026-11-19T10:30:00Z',
  previousAt: '2026-11-19T10:00:00Z',
  energyKwh: 0.5,
  intervalMinutes: 30,
  averageWatts: 1000,
  minutesStored: 30,
  minutesRejected: 0,
}

describe('sourceSentence', () => {
  it('says plainly where the numbers come from, and never calls simulated or entered numbers measured', () => {
    expect(sourceSentence('DEVICE', 'last hour')).toBe(
      'Watts reported by the smart plug, last hour.',
    )
    expect(sourceSentence('SIMULATED', 'last hour')).toContain('not this appliance')
    expect(sourceSentence('MANUAL', 'last hour')).toContain('Entered by you, last hour.')
    expect(sourceSentence('MANUAL', 'last hour')).toContain('not a minute-by-minute measurement')
    expect(sourceSentence(null, 'last hour')).toContain('No live source')
  })
})

describe('describeMeterResult', () => {
  it('explains a starting point and a recorded interval', () => {
    expect(
      describeMeterResult({
        ...recorded,
        outcome: 'BASELINE',
        previousAt: null,
        intervalMinutes: 0,
        averageWatts: null,
        minutesStored: 0,
      }),
    ).toMatch(/starting point/)
    expect(describeMeterResult(recorded)).toBe(
      'Added 30 minutes at an average of 1,000 W (0.5 kWh over 30 min).',
    )
  })

  it('says how many minutes fell outside the accepted window', () => {
    expect(describeMeterResult({ ...recorded, minutesStored: 10, minutesRejected: 20 })).toContain(
      '20 minutes fell outside the 30 days',
    )
  })
})

describe('describeImport', () => {
  it('counts what was added, already there and outside the window, in singular and plural', () => {
    expect(describeImport({ rows: 2, accepted: 2, duplicates: 0, rejected: 0 })).toBe(
      'Imported 2 readings.',
    )
    expect(describeImport({ rows: 1, accepted: 0, duplicates: 1, rejected: 0 })).toBe(
      'Imported 0 readings. 1 reading was already there.',
    )
    expect(describeImport({ rows: 2, accepted: 0, duplicates: 0, rejected: 2 })).toContain(
      '2 readings fell outside the 30 days Home Pulse accepts, so they were not stored.',
    )
  })
})
