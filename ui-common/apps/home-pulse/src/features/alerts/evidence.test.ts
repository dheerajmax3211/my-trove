import { describe, expect, it } from 'vitest'
import { alertContext, describeAlert } from './evidence'
import type { AlertDto } from './types'

type Input = Pick<AlertDto, 'kind' | 'applianceName' | 'message' | 'evidence'>
const alert = (
  kind: AlertDto['kind'],
  evidence: Record<string, unknown>,
  message = 'Server message.',
): Input => ({
  kind,
  applianceName: 'Kitchen fridge',
  message,
  evidence,
})

describe('describeAlert', () => {
  describe('POWER_SHIFT', () => {
    const ev = {
      baselineWatts: 120,
      currentWatts: 136.8,
      changePct: 14,
      windowHours: 6,
      windowsDeviating: 3,
    }

    it('says how much more the appliance draws than normal', () => {
      const e = describeAlert(alert('POWER_SHIFT', ev))
      expect(e.headline).toBe('Kitchen fridge draws 14% more power than its normal while running.')
      expect(e.facts[0]).toBe('Normal running power: 120 W. Recently: 137 W.')
      expect(e.facts[1]).toContain('3 of the last 4 comparison periods of 6 hours each')
      expect(e.suggestion).toMatch(/early sign of wear/)
    })

    it('says "less" for a drop and gives different advice', () => {
      const e = describeAlert(alert('POWER_SHIFT', { ...ev, currentWatts: 96, changePct: -20 }))
      expect(e.headline).toContain('20% less power')
      expect(e.suggestion).toMatch(/doing less work/)
    })

    it('derives the percentage when the service did not send one', () => {
      const e = describeAlert(alert('POWER_SHIFT', { baselineWatts: 100, currentWatts: 125 }))
      expect(e.headline).toContain('25% more')
      expect(e.facts).toHaveLength(1)
    })

    it('falls back to the service message when the numbers are missing or unusable', () => {
      expect(describeAlert(alert('POWER_SHIFT', {})).headline).toBe('Server message.')
      expect(
        describeAlert(alert('POWER_SHIFT', { baselineWatts: 0, currentWatts: 5 })).headline,
      ).toBe('Server message.')
      expect(
        describeAlert(alert('POWER_SHIFT', { baselineWatts: '120', currentWatts: 'x' })).facts,
      ).toEqual([])
    })
  })

  describe('DUTY_CYCLE_DRIFT', () => {
    it('explains duty and run length together', () => {
      const e = describeAlert(
        alert('DUTY_CYCLE_DRIFT', {
          baselineDutyPct: 40,
          currentDutyPct: 50,
          baselineCycleMinutes: 16,
          currentCycleMinutes: 24,
        }),
      )
      expect(e.headline).toBe('Kitchen fridge runs 25% more of the time than normal.')
      expect(e.facts).toEqual([
        'It ran 50% of the time. Normally it runs 40%.',
        'Each run lasted 24 min. Normally a run lasts 16 min.',
      ])
    })

    it('works with only the run length', () => {
      const e = describeAlert(
        alert('DUTY_CYCLE_DRIFT', { baselineCycleMinutes: 20, currentCycleMinutes: 30 }),
      )
      expect(e.headline).toBe('Kitchen fridge runs 50% longer per cycle than normal.')
      expect(e.facts).toHaveLength(1)
    })

    it('falls back when neither measure is usable', () => {
      expect(
        describeAlert(alert('DUTY_CYCLE_DRIFT', { baselineDutyPct: 0, currentDutyPct: 10 }))
          .headline,
      ).toBe('Server message.')
    })
  })

  describe('STUCK_ON and STOPPED', () => {
    const ev = {
      runMinutes: 1200,
      limitMinutes: 120,
      longestNormalRunMinutes: 14,
      since: '2026-11-18T16:00:00Z',
    }

    it('reports how long it has been running non-stop against its longest normal run', () => {
      const e = describeAlert(alert('STUCK_ON', ev))
      expect(e.headline).toBe('Kitchen fridge has been running non-stop for 20 h.')
      expect(e.facts[0]).toBe('The longest run it normally has is 14 min.')
      expect(e.facts[1]).toMatch(/^Running since /)
    })

    it('reports how long it has not switched on', () => {
      const e = describeAlert(alert('STOPPED', ev))
      expect(e.headline).toBe(
        'Kitchen fridge has not switched on for 20 h, although it normally cycles.',
      )
      expect(e.facts[0]).toContain('longest pause')
      expect(e.facts[1]).toMatch(/^Idle since /)
    })

    it('ignores a timestamp it cannot read', () => {
      expect(
        describeAlert(alert('STUCK_ON', { ...ev, since: 'yesterday-ish' })).facts,
      ).toHaveLength(1)
    })

    it('falls back without a run length', () => {
      expect(describeAlert(alert('STUCK_ON', {})).headline).toBe('Server message.')
    })
  })

  describe('NO_DATA', () => {
    it('says how long the sensor has been silent and when it was last seen', () => {
      const e = describeAlert(
        alert('NO_DATA', {
          lastSeen: '2026-11-19T08:00:00Z',
          silentMinutes: 245,
          thresholdMinutes: 60,
        }),
      )
      expect(e.headline).toBe('No readings from Kitchen fridge for 4 h 5 min.')
      expect(e.facts[0]).toMatch(/^Last reading: /)
      expect(e.facts[1]).toBe('An alert is raised after 1 h of silence.')
      expect(e.suggestion).toMatch(/Wi-Fi/)
    })

    it('handles a sensor that never reported', () => {
      const e = describeAlert(alert('NO_DATA', { thresholdMinutes: 60 }))
      expect(e.headline).toBe('The sensor on Kitchen fridge has never reported a reading.')
    })
  })

  it('never returns an empty headline', () => {
    expect(describeAlert({ ...alert('STOPPED', {}), message: '' }).headline).toBe(
      'Kitchen fridge needs attention.',
    )
  })
})

describe('alertContext', () => {
  const base = {
    underWarranty: false,
    warrantyEndDate: null,
    daysToWarrantyEnd: null,
    serviceOverdue: false,
    nextServiceDate: null,
    status: 'OPEN' as const,
  }

  it('is empty when nothing applies', () => {
    expect(alertContext(base)).toEqual([])
  })

  it('points out that the warranty is still running, with the days left', () => {
    const [line] = alertContext({
      ...base,
      underWarranty: true,
      warrantyEndDate: '2027-02-12',
      daysToWarrantyEnd: 85,
    })
    expect(line).toContain('Still under warranty until')
    expect(line).toContain('(85 days left)')
    expect(line).toContain('Get it checked before the warranty ends.')
  })

  it('uses the singular for one day left and stays quiet for resolved alerts', () => {
    expect(
      alertContext({
        ...base,
        underWarranty: true,
        warrantyEndDate: '2026-11-20',
        daysToWarrantyEnd: 1,
      })[0],
    ).toContain('(1 day left)')
    expect(
      alertContext({
        ...base,
        status: 'RESOLVED',
        underWarranty: true,
        warrantyEndDate: '2027-02-12',
        daysToWarrantyEnd: 85,
      }),
    ).toEqual([])
  })

  it('mentions an overdue service', () => {
    const lines = alertContext({ ...base, serviceOverdue: true, nextServiceDate: '2026-11-07' })
    expect(lines).toEqual([expect.stringContaining('Its service was due on')])
  })
})
