import { describe, expect, it } from 'vitest'
import { formatBytes, formatCountdown, formatDuration, msUntil } from './format'

describe('formatting', () => {
  it('shows the two largest units of a duration', () => {
    expect(formatDuration(0)).toBe('0 seconds')
    expect(formatDuration(90)).toBe('1 minute 30 seconds')
    expect(formatDuration(86400)).toBe('1 day')
    expect(formatDuration(30 * 86400 + 3600 + 5)).toBe('30 days 1 hour')
    expect(formatDuration(120 * 86400)).toBe('120 days')
  })

  it('counts down in fixed-width fields', () => {
    expect(formatCountdown(0)).toBe('00h 00m 00s')
    expect(formatCountdown(-5000)).toBe('00h 00m 00s')
    expect(formatCountdown(3 * 3600_000 + 5 * 60_000 + 9_000)).toBe('03h 05m 09s')
    expect(formatCountdown(12 * 86400_000 + 3 * 3600_000 + 5 * 60_000)).toBe('12d 03h 05m')
  })

  it('formats sizes and time left', () => {
    expect(formatBytes(512)).toBe('512 bytes')
    expect(formatBytes(2048)).toBe('2.0 KiB')
    expect(formatBytes(3 * 1024 * 1024)).toBe('3.00 MiB')
    expect(msUntil(null, 0)).toBeNull()
    expect(msUntil('1970-01-01T00:00:10Z', 4000)).toBe(6000)
  })
})
