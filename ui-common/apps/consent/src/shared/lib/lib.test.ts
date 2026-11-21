import { ApiError } from '@platform/api-client'
import { describe, expect, it } from 'vitest'
import type { AuditEntry } from '../api/types'
import { describeBreak, eventLabel, summarizeEntry } from './audit'
import { describeError, errorCode, fieldErrors } from './errors'
import {
  formatDuration,
  formatHours,
  formatReads,
  formatRelative,
  splitDuration,
  toSeconds,
} from './format'
import { MAX_VALUE_CHARS, parseJsonValue, previewJson, stringifyJson } from './json'
import { isValidKeyPath, parseScope, parseScopeInput, pathCovers, scopeCoversPath } from './scopes'

describe('scopes', () => {
  it('validates key paths like the gateway: lowercase dotted segments', () => {
    for (const ok of ['profile', 'profile.sizes.shoe', 'a_1.b2'])
      expect(isValidKeyPath(ok)).toBe(true)
    for (const bad of ['', 'Profile', 'a..b', '.a', 'a.', 'a b', 'a-b', 'x'.repeat(256)])
      expect(isValidKeyPath(bad)).toBe(false)
  })

  it('parses path:read scopes only', () => {
    expect(parseScope('profile.sizes:read')).toEqual({ path: 'profile.sizes', action: 'read' })
    for (const bad of ['profile', ':read', 'profile:', 'profile:write', 'Bad:read'])
      expect(parseScope(bad)).toBeNull()
  })

  it('matches on whole path segments', () => {
    expect(pathCovers('profile.sizes', 'profile.sizes')).toBe(true)
    expect(pathCovers('profile.sizes', 'profile.sizes.shoe')).toBe(true)
    expect(pathCovers('profile.sizes', 'profile.sizes_secret')).toBe(false)
    expect(pathCovers('profile.sizes', 'profile.sizesx')).toBe(false)
    expect(pathCovers('profile.sizes', 'profile')).toBe(false)
    expect(scopeCoversPath('profile.sizes:read', 'profile.sizes.shoe')).toBe(true)
    expect(scopeCoversPath('garbage', 'profile.sizes.shoe')).toBe(false)
  })

  it('turns free text into canonical, de-duplicated, sorted scopes and adds :read', () => {
    expect(parseScopeInput('profile.sizes\nhealth.allergies:read, profile.sizes:read')).toEqual({
      ok: true,
      scopes: ['health.allergies:read', 'profile.sizes:read'],
    })
    expect(parseScopeInput('  \n ')).toEqual({ ok: false, message: 'Add at least one scope.' })
    const bad = parseScopeInput('Profile Sizes')
    expect(bad.ok).toBe(false)
    expect(!bad.ok && bad.message).toContain('"Profile Sizes" is not a valid scope')
    expect(parseScopeInput('a:write').ok).toBe(false)
  })
})

describe('json value editor rules', () => {
  it('accepts any JSON value except null and empty', () => {
    expect(parseJsonValue('"M"')).toEqual({ ok: true, value: 'M' })
    expect(parseJsonValue('42')).toEqual({ ok: true, value: 42 })
    expect(parseJsonValue('false')).toEqual({ ok: true, value: false })
    expect(parseJsonValue('{"a":[1]}')).toEqual({ ok: true, value: { a: [1] } })
  })

  it('rejects invalid JSON, null, empty text and oversized values with a reason', () => {
    const invalid = parseJsonValue('{oops')
    expect(!invalid.ok && invalid.message).toMatch(/not valid JSON/)
    expect(parseJsonValue('M').ok).toBe(false)
    expect(parseJsonValue('null')).toMatchObject({
      ok: false,
      message: expect.stringContaining('null'),
    })
    expect(parseJsonValue('   ')).toMatchObject({ ok: false })
    const big = parseJsonValue(JSON.stringify('x'.repeat(MAX_VALUE_CHARS)))
    expect(!big.ok && big.message).toContain('larger than')
  })

  it('pretty-prints and previews', () => {
    expect(stringifyJson({ a: 1 })).toBe('{\n  "a": 1\n}')
    expect(stringifyJson({ a: 1 }, false)).toBe('{"a":1}')
    expect(previewJson('M')).toBe('"M"')
    expect(previewJson('x'.repeat(100), 10)).toHaveLength(10)
  })
})

describe('formatting', () => {
  it('formats durations in the two largest units', () => {
    expect(formatDuration(30)).toBe('30 seconds')
    expect(formatDuration(60)).toBe('1 minute')
    expect(formatDuration(3600)).toBe('1 hour')
    expect(formatDuration(5400)).toBe('1 hour 30 minutes')
    expect(formatDuration(7 * 86_400)).toBe('7 days')
    expect(formatDuration(86_400 + 3600 + 60)).toBe('1 day 1 hour')
  })

  it('splits a duration into the largest exact unit and converts back', () => {
    expect(splitDuration(7 * 86_400)).toEqual({ amount: 7, unit: 'days' })
    expect(splitDuration(7200)).toEqual({ amount: 2, unit: 'hours' })
    expect(splitDuration(90)).toEqual({ amount: 1.5, unit: 'minutes' })
    expect(toSeconds(3, 'days')).toBe(259_200)
    expect(toSeconds(5, 'minutes')).toBe(300)
  })

  it('formats reads, hours and relative times', () => {
    expect(formatReads(3, 10)).toBe('3 of 10 reads')
    expect(formatReads(1, null)).toBe('1 read, no limit')
    expect(formatHours({ startHour: 9, endHour: 24, zone: 'UTC' })).toBe('09:00 to 00:00 (UTC)')
    const now = Date.parse('2026-11-19T12:00:00Z')
    expect(formatRelative('2026-11-26T12:00:00Z', now)).toBe('in 7 days')
    expect(formatRelative('2026-11-19T10:00:00Z', now)).toBe('2 hours ago')
  })
})

const entry = (eventType: AuditEntry['eventType'], detail: object): AuditEntry => ({
  seq: 1,
  eventType,
  actorType: 'CLIENT',
  actorId: 'c',
  clientId: 'c',
  grantId: null,
  detail: JSON.stringify(detail),
  occurredAt: '2026-11-19T12:00:00Z',
  prevHash: '0',
  entryHash: '1',
})

describe('audit wording', () => {
  it('labels events and falls back to the raw type', () => {
    expect(eventLabel('DATA_READ')).toBe('Data read')
    expect(eventLabel('SOMETHING_NEW')).toBe('SOMETHING_NEW')
  })

  it('summarises entries in plain words without values', () => {
    expect(
      summarizeEntry(entry('DATA_READ', { keys: ['a.b', 'a.c'], withheldBySensitivity: 2 })),
    ).toBe('Read a.b, a.c; 2 withheld by the sensitivity limit')
    expect(summarizeEntry(entry('DATA_READ', { keys: [] }))).toBe(
      'Read nothing (no matching attributes)',
    )
    expect(summarizeEntry(entry('DATA_DENIED', { reason: 'MAX_READS_EXHAUSTED' }))).toBe(
      'Refused: read limit used up',
    )
    expect(summarizeEntry(entry('GRANT_REVOKED', { cause: 'CLIENT_DISABLED' }))).toBe(
      'Because the app was disabled',
    )
    expect(summarizeEntry(entry('VAULT_ATTRIBUTE_CREATED', { keyPath: 'a.b' }))).toBe('a.b')
    expect(summarizeEntry({ ...entry('DATA_READ', {}), detail: 'not json' })).toBe(
      'Read nothing (no matching attributes)',
    )
  })

  it('explains each way the chain can break', () => {
    expect(describeBreak('ENTRY_HASH_MISMATCH', 7).headline).toBe(
      'Entry #7 was changed after it was written',
    )
    expect(describeBreak('PREV_HASH_MISMATCH', 7).headline).toContain('does not link')
    expect(describeBreak('SEQUENCE_GAP', 7).headline).toBe('Entry #7 is missing or out of order')
    expect(describeBreak('HEAD_MISMATCH', 7).headline).toBe(
      'The log is missing entries from #7 onwards',
    )
  })
})

describe('error mapping', () => {
  const problem = (status: number, extensions: Record<string, unknown> = {}, detail?: string) =>
    new ApiError({ status, title: `HTTP ${status}`, ...(detail ? { detail } : {}), extensions })

  it('turns every failure class into a readable message', () => {
    expect(describeError(problem(0)).title).toBe('Cannot reach the gateway')
    expect(describeError(problem(401)).title).toBe('You have been signed out')
    expect(describeError(problem(503)).title).toBe('The gateway had a problem')
    expect(describeError(problem(409, {}, 'Request was already DENIED'))).toEqual({
      title: 'HTTP 409',
      message: 'Request was already DENIED',
    })
    expect(describeError(new Error('x')).title).toBe('Something went wrong')
  })

  it('reads the stable code and field errors of a problem document', () => {
    expect(errorCode(problem(409, { code: 'ATTRIBUTE_EXISTS' }))).toBe('ATTRIBUTE_EXISTS')
    expect(errorCode(new Error('x'))).toBeUndefined()
    expect(
      fieldErrors(
        problem(400, { errors: { name: 'must not be blank', 'allowedScopes[0]': 'bad', n: 5 } }),
      ),
    ).toEqual({ name: 'must not be blank', allowedScopes: 'bad' })
    expect(fieldErrors(problem(400, { errors: ['x'] }))).toEqual({})
    expect(fieldErrors(null)).toEqual({})
  })
})
