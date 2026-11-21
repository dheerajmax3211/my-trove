import { describe, expect, it } from 'vitest'
import { dayOffset, groupByDay, groupFor } from './day'

// Local-time constructors keep these independent of the machine's time zone.
const local = (y: number, m: number, d: number, h = 9, min = 0) =>
  new Date(y, m - 1, d, h, min).getTime()
const NOW = local(2026, 11, 19, 9, 0) // a Thursday

describe('dayOffset', () => {
  it('counts calendar days, not 24-hour blocks', () => {
    expect(dayOffset(local(2026, 11, 19, 23, 59), NOW)).toBe(0)
    expect(dayOffset(local(2026, 11, 20, 0, 1), NOW)).toBe(1)
    expect(dayOffset(local(2026, 11, 18, 23, 0), NOW)).toBe(-1)
    expect(dayOffset(local(2026, 12, 1), NOW)).toBe(12)
  })
})

describe('groupFor', () => {
  it('puts an active reminder that is past due in Overdue, even earlier today', () => {
    expect(groupFor(local(2026, 11, 19, 8, 0), NOW, true)).toBe('overdue')
    expect(groupFor(local(2026, 11, 10), NOW, true)).toBe('overdue')
  })
  it('splits what is ahead into today, tomorrow, this week and later', () => {
    expect(groupFor(local(2026, 11, 19, 18, 0), NOW, true)).toBe('today')
    expect(groupFor(local(2026, 11, 20, 8, 0), NOW, true)).toBe('tomorrow')
    expect(groupFor(local(2026, 11, 25), NOW, true)).toBe('week')
    expect(groupFor(local(2026, 11, 25), NOW, true)).toBe('week') // six days ahead
    expect(groupFor(local(2026, 11, 26), NOW, true)).toBe('later') // a full week ahead
  })
  it('files finished reminders from earlier days under Earlier, not Overdue', () => {
    expect(groupFor(local(2026, 11, 16), NOW, false)).toBe('earlier')
    expect(groupFor(local(2026, 11, 19, 8, 0), NOW, false)).toBe('today')
  })
})

describe('groupByDay', () => {
  const items = [
    { id: 'a', due: local(2026, 12, 20), active: true },
    { id: 'b', due: local(2026, 11, 19, 17, 0), active: true },
    { id: 'c', due: local(2026, 11, 17), active: true },
    { id: 'd', due: local(2026, 11, 20, 10, 0), active: true },
    { id: 'e', due: local(2026, 11, 22), active: true },
    { id: 'f', due: local(2026, 11, 12), active: false },
    { id: 'g', due: local(2026, 11, 19, 20, 0), active: true },
  ]
  const groups = groupByDay(items, NOW, (i) => ({ dueMs: i.due, active: i.active }))

  it('orders the groups from most urgent to furthest away and omits empty ones', () => {
    expect(groups.map((g) => g.label)).toEqual([
      'Overdue',
      'Today',
      'Tomorrow',
      'This week',
      'Later',
      'Earlier',
    ])
    expect(groupByDay([], NOW, () => ({ dueMs: NOW, active: true }))).toEqual([])
  })
  it('keeps the order of items inside a group', () => {
    expect(groups.find((g) => g.group === 'today')?.items.map((i) => i.id)).toEqual(['b', 'g'])
  })
})
