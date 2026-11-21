import { describe, expect, it } from 'vitest'
import {
  addDays,
  calendarDaysBetween,
  describeDayOffset,
  parseCalendarDate,
  toCalendarDate,
} from './dates'

describe('calendar dates', () => {
  it('round-trips a calendar date without shifting it', () => {
    expect(toCalendarDate(parseCalendarDate('2026-03-01') as Date)).toBe('2026-03-01')
  })

  it('rejects malformed and impossible dates', () => {
    expect(parseCalendarDate('2026-13-01')).toBeNull()
    expect(parseCalendarDate('2026-02-30')).toBeNull()
    expect(parseCalendarDate('tomorrow')).toBeNull()
  })

  it('counts whole days across month ends and ignores the time of day', () => {
    expect(calendarDaysBetween(new Date(2026, 0, 31, 23, 59), new Date(2026, 1, 2, 0, 1))).toBe(2)
    expect(calendarDaysBetween(addDays(new Date(2026, 5, 1), 10), new Date(2026, 5, 1))).toBe(-10)
  })

  it('describes offsets in words', () => {
    expect(describeDayOffset(0)).toBe('today')
    expect(describeDayOffset(1)).toBe('tomorrow')
    expect(describeDayOffset(-1)).toBe('yesterday')
    expect(describeDayOffset(4)).toBe('in 4 days')
    expect(describeDayOffset(-4)).toBe('4 days ago')
  })
})
