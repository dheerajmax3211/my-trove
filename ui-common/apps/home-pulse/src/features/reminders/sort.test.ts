import { describe, expect, it } from 'vitest'
import { sortReminders } from './sort'
import type { Reminder } from './types'

const r = (
  name: string,
  type: Reminder['type'],
  daysUntil: number,
  highPriority = false,
): Reminder => ({
  applianceId: name,
  applianceName: name,
  type,
  dueDate: '2026-12-01',
  daysUntil,
  highPriority,
  message: '',
})

describe('sortReminders', () => {
  it('puts anomaly-under-warranty style reminders first, then the soonest, then by name and type', () => {
    const sorted = sortReminders([
      r('Zed', 'SERVICE_DUE', 3),
      r('Amp', 'WARRANTY_ENDING', 3),
      r('Fridge', 'WARRANTY_CLAIM_WINDOW', 85, true),
      r('Pump', 'SERVICE_OVERDUE', -12, true),
      r('Amp', 'SERVICE_DUE', 3),
    ])
    expect(sorted.map((x) => `${x.applianceName}:${x.type}`)).toEqual([
      'Pump:SERVICE_OVERDUE',
      'Fridge:WARRANTY_CLAIM_WINDOW',
      'Amp:SERVICE_DUE',
      'Amp:WARRANTY_ENDING',
      'Zed:SERVICE_DUE',
    ])
  })

  it('does not change the list it is given', () => {
    const input = [r('b', 'SERVICE_DUE', 2), r('a', 'SERVICE_DUE', 1)]
    sortReminders(input)
    expect(input[0]?.applianceName).toBe('b')
  })
})
