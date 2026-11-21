import { describe, expect, it } from 'vitest'
import { describeDue, firstName, greetingFor, sortFeed } from './today'

describe('sortFeed', () => {
  it('orders by severity, then due date, with undated items last', () => {
    const sorted = sortFeed([
      { title: 'info early', severity: 'info', dueAt: '2026-11-20T00:00:00Z' },
      { title: 'warn late', severity: 'warn', dueAt: '2026-11-30T00:00:00Z' },
      { title: 'danger undated', severity: 'danger' },
      { title: 'warn early', severity: 'warn', dueAt: '2026-11-22T00:00:00Z' },
      { title: 'danger dated', severity: 'danger', dueAt: '2026-11-25T00:00:00Z' },
    ] as const)
    expect(sorted.map((item) => item.title)).toEqual([
      'danger dated',
      'danger undated',
      'warn early',
      'warn late',
      'info early',
    ])
  })
})

describe('greetingFor', () => {
  it('follows the time of day', () => {
    expect(greetingFor(new Date('2026-11-21T08:00:00'))).toBe('Good morning')
    expect(greetingFor(new Date('2026-11-21T13:00:00'))).toBe('Good afternoon')
    expect(greetingFor(new Date('2026-11-21T20:00:00'))).toBe('Good evening')
  })
})

describe('describeDue', () => {
  const now = new Date('2026-11-21T10:00:00')
  it('speaks in days', () => {
    expect(describeDue('2026-11-21T18:00:00', now)).toBe('Due today')
    expect(describeDue('2026-11-22T09:00:00', now)).toBe('Due tomorrow')
    expect(describeDue('2026-11-25T09:00:00', now)).toBe('Due in 4 days')
    expect(describeDue('2026-11-19T09:00:00', now)).toBe('Overdue by 2 days')
    expect(describeDue('2026-11-20T09:00:00', now)).toBe('Overdue by 1 day')
  })
  it('handles missing and invalid dates', () => {
    expect(describeDue(undefined, now)).toBeNull()
    expect(describeDue('not a date', now)).toBeNull()
  })
})

describe('firstName', () => {
  it('takes the first word of a display name', () => {
    expect(firstName('Ada Lovelace')).toBe('Ada')
    expect(firstName('  ')).toBeNull()
    expect(firstName(null)).toBeNull()
  })
})
