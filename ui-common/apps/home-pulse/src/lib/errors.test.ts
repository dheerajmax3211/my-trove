import { ApiError } from '@platform/api-client'
import { describe, expect, it } from 'vitest'
import { errorMessage, fieldErrorsFrom } from './errors'

const api = (status: number, detail?: string, extensions: Record<string, unknown> = {}) =>
  new ApiError({ status, ...(detail ? { detail } : {}), title: `HTTP ${status}`, extensions })

describe('errorMessage', () => {
  it('uses the service detail for client errors', () => {
    expect(
      errorMessage(
        api(409, 'Appliance already has an active device; revoke it first to rotate the token'),
      ),
    ).toBe('Appliance already has an active device; revoke it first to rotate the token')
  })

  it('has friendly wording for network failure, expired session, missing item and server trouble', () => {
    expect(errorMessage(api(0))).toMatch(/Could not reach/)
    expect(errorMessage(api(401))).toMatch(/session has ended/)
    expect(errorMessage(api(404))).toBe('That item no longer exists.')
    expect(errorMessage(api(404, 'Appliance not found'))).toBe('Appliance not found')
    expect(errorMessage(api(503, 'java.lang.NullPointerException at ...'))).toMatch(/had a problem/)
  })

  it('does not leak details of unknown errors', () => {
    expect(errorMessage(new Error('boom: secret path /etc'))).toBe(
      'Something went wrong. Please try again.',
    )
    expect(errorMessage('oops')).toBe('Something went wrong. Please try again.')
  })
})

describe('fieldErrorsFrom', () => {
  const fields = ['name', 'type', 'warrantyEndDate'] as const

  it('splits the Spring validation text into per-field messages', () => {
    const errors = fieldErrorsFrom(
      api(400, 'name must not be blank; type must not be null'),
      fields,
    )
    expect(errors).toEqual({ name: 'Must not be blank', type: 'Must not be null' })
  })

  it('maps the date rule the service enforces by hand', () => {
    expect(
      fieldErrorsFrom(api(400, 'warrantyEndDate must not be before purchaseDate'), fields),
    ).toEqual({
      warrantyEndDate: 'Must not be before purchaseDate',
    })
  })

  it('keeps clauses that name no known field as a form-level message', () => {
    expect(fieldErrorsFrom(api(400, 'Failed to read request'), fields)).toEqual({
      '': 'Failed to read request',
    })
  })

  it('also understands an `errors` map extension', () => {
    expect(
      fieldErrorsFrom(
        api(400, 'Validation failed', { errors: { name: ['too short', 'x'] } }),
        fields,
      ),
    ).toEqual({
      name: 'too short',
    })
  })

  it('returns nothing for other statuses and other errors', () => {
    expect(fieldErrorsFrom(api(500, 'name must not be blank'), fields)).toEqual({})
    expect(fieldErrorsFrom(new Error('x'), fields)).toEqual({})
  })
})
