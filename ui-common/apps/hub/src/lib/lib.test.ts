import { ApiError } from '@platform/api-client'
import { describe, expect, it } from 'vitest'
import { errorHeading, errorMessage } from './errors'
import {
  formatBytes,
  formatRelative,
  fromLocalInputValue,
  isUuid,
  shortId,
  toLocalInputValue,
} from './format'

const api = (status: number, detail?: string) =>
  new ApiError({ status, title: `HTTP ${status}`, ...(detail ? { detail } : {}) })

describe('errorMessage', () => {
  it('prefers the server business message', () => {
    expect(errorMessage(api(409, 'The last owner cannot leave or be demoted'))).toBe(
      'The last owner cannot leave or be demoted',
    )
  })
  it('replaces the nameless Spring validation message with plain guidance', () => {
    expect(errorMessage(api(400, 'Invalid request content.'))).toMatch(
      /did not accept those values/,
    )
  })
  it.each([
    [0, /could not reach the server/],
    [401, /session has ended/],
    [403, /do not have permission/],
    [404, /could not find that/],
    [503, /server had a problem/],
  ])('explains status %i without leaking technical text', (status, pattern) => {
    expect(errorMessage(api(status))).toMatch(pattern)
  })
  it('handles non-API errors', () => {
    expect(errorMessage(new Error('boom'))).toBe('Something went wrong. Try again.')
  })
  it('picks a heading by failure kind', () => {
    expect(errorHeading(api(0))).toBe('Cannot reach the server')
    expect(errorHeading(api(404))).toBe('Not found')
    expect(errorHeading(api(500))).toBe('Something went wrong')
  })
})

describe('format helpers', () => {
  it('formats byte sizes', () => {
    expect(formatBytes(512)).toBe('512 B')
    expect(formatBytes(1536)).toBe('1.5 KB')
    expect(formatBytes(10 * 1024 * 1024)).toBe('10 MB')
  })
  it('round-trips datetime-local values through ISO instants', () => {
    const iso = '2026-12-01T10:30:00.000Z'
    expect(fromLocalInputValue(toLocalInputValue(iso))).toBe(iso)
    expect(fromLocalInputValue('')).toBeNull()
    expect(fromLocalInputValue('not a date')).toBeNull()
  })
  it('describes times relative to a given now', () => {
    const now = Date.parse('2026-11-19T09:00:00Z')
    expect(formatRelative('2026-11-22T09:00:00Z', now)).toBe('in 3 days')
    expect(formatRelative('2026-11-19T07:00:00Z', now)).toBe('2 hours ago')
  })
  it('shortens long ids but not short ones, and recognises UUIDs', () => {
    expect(shortId('0198a1ce-0000-7000-8000-000000000001')).toBe('0198a1ce...0001')
    expect(shortId('demo-alice')).toBe('demo-alice')
    expect(isUuid('0198a1ce-0000-7000-8000-000000000001')).toBe(true)
    expect(isUuid('nope')).toBe(false)
  })
})
