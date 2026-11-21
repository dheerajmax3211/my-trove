import { ApiError } from '@platform/api-client'
import { describe, expect, it } from 'vitest'
import { describeError, fieldErrorsOf } from './errors'

const problem = (status: number, code: string | null, detail?: string) =>
  new ApiError({
    status,
    title: `HTTP ${status}`,
    ...(detail ? { detail } : {}),
    extensions: code ? { code } : {},
  })

describe('describeError', () => {
  it('explains an overdraft in money terms and ties it to the amount field', () => {
    const d = describeError(
      problem(422, 'INSUFFICIENT_FUNDS', 'account would be overdrawn (available 1250 minor units)'),
      { currency: 'USD' },
    )
    expect(d.message).toMatch(/not enough money/i)
    expect(d.message).toContain('$12.50')
    expect(d.field).toBe('amount')
    expect(d.kind).toBe('funds')
  })

  it('still explains an overdraft without a currency', () => {
    expect(describeError(problem(422, 'INSUFFICIENT_FUNDS')).message).toMatch(/not enough money/i)
  })

  it('treats a reused key as a conflict that needs a fresh key', () => {
    const d = describeError(problem(409, 'IDEMPOTENCY_KEY_REUSED'))
    expect(d.kind).toBe('conflict')
    expect(d.rotateKey).toBe(true)
    expect(d.message).toMatch(/fresh request/i)
  })

  it.each([
    ['ALREADY_REVERSED', /already been reversed/i],
    ['ALREADY_DECIDED', /already decided/i],
    ['APPROVAL_EXPIRED', /expired/i],
    ['LAST_OWNER', /at least one owner/i],
    ['SELF_APPROVAL', /your own request/i],
  ])('has a plain message for %s', (code, pattern) => {
    expect(describeError(problem(code === 'SELF_APPROVAL' ? 403 : 409, code)).message).toMatch(
      pattern,
    )
  })

  it('says a network failure is safe to retry with the same key', () => {
    const d = describeError(new ApiError({ status: 0, title: 'Network error' }))
    expect(d.kind).toBe('network')
    expect(d.retryable).toBe(true)
    expect(d.rotateKey).toBe(false)
    expect(d.message).toMatch(/never be recorded twice/i)
  })

  it('falls back by status for unknown codes', () => {
    expect(describeError(problem(409, null, 'Something conflicts')).message).toBe(
      'Something conflicts',
    )
    expect(describeError(problem(500, null)).retryable).toBe(true)
    expect(describeError(problem(404, 'NOT_FOUND')).kind).toBe('not-found')
    expect(describeError(problem(400, null, 'Invalid request content.')).message).toBe(
      'Invalid request content.',
    )
  })

  it('handles non-API errors', () => {
    expect(describeError(new Error('boom')).message).toMatch(/something went wrong/i)
  })
})

describe('fieldErrorsOf', () => {
  it('reads an `errors` extension map when a service sends one', () => {
    const error = new ApiError({
      status: 422,
      title: 'Validation failed',
      extensions: { errors: { name: ['Too short.', 'Be kinder.'], other: 'x' } },
    })
    expect(fieldErrorsOf(error)).toEqual({ name: 'Too short. Be kinder.', other: 'x' })
    expect(fieldErrorsOf(new Error('x'))).toEqual({})
  })
})
