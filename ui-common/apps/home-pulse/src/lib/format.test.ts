import { describe, expect, it } from 'vitest'
import {
  formatDaysUntil,
  formatDuration,
  formatPercent,
  formatRelative,
  formatWatts,
  parseLocalDate,
  pluralize,
  toDateInputValue,
} from './format'

describe('format', () => {
  it('shows small wattages with a decimal and larger ones as whole watts', () => {
    expect(formatWatts(3.2)).toBe('3.2 W')
    expect(formatWatts(118.4)).toBe('118 W')
    expect(formatWatts(0)).toBe('0.0 W')
  })

  it('formats durations the way people say them', () => {
    expect(formatDuration(0.2)).toBe('under a minute')
    expect(formatDuration(45)).toBe('45 min')
    expect(formatDuration(60)).toBe('1 h')
    expect(formatDuration(860)).toBe('14 h 20 min')
    expect(formatDuration(1440)).toBe('1 d')
    expect(formatDuration(3 * 1440 + 90)).toBe('3 d 1 h')
  })

  it('writes relative times for events in the past', () => {
    const now = new Date('2026-11-19T12:00:00Z')
    expect(formatRelative(null, now)).toBe('Never')
    expect(formatRelative('2026-11-19T11:59:40Z', now)).toBe('Just now')
    expect(formatRelative('2026-11-19T11:55:00Z', now)).toBe('5 min ago')
    expect(formatRelative('2026-11-19T09:00:00Z', now)).toBe('3 h ago')
    expect(formatRelative('2026-11-18T09:00:00Z', now)).toBe('1 day ago')
    expect(formatRelative('2026-11-10T09:00:00Z', now)).toBe('9 days ago')
  })

  it('words days until a date, overdue when negative', () => {
    expect(formatDaysUntil(0)).toBe('today')
    expect(formatDaysUntil(1)).toBe('tomorrow')
    expect(formatDaysUntil(12)).toBe('in 12 days')
    expect(formatDaysUntil(-1)).toBe('1 day overdue')
    expect(formatDaysUntil(-12)).toBe('12 days overdue')
  })

  it('reads calendar dates as local days, without a time zone shift', () => {
    const d = parseLocalDate('2026-03-01')
    expect([d.getFullYear(), d.getMonth(), d.getDate()]).toEqual([2026, 2, 1])
    expect(toDateInputValue(d)).toBe('2026-03-01')
  })

  it('pluralizes and formats percentages', () => {
    expect(pluralize(1, 'alert')).toBe('1 alert')
    expect(pluralize(3, 'alert')).toBe('3 alerts')
    expect(formatPercent(47.24)).toBe('47%')
    expect(formatPercent(47.24, 1)).toBe('47.2%')
  })
})
