import { ApiError } from '@platform/api-client'
import { describe, expect, it } from 'vitest'
import { describeError, serverFieldErrors } from './errors'

const err = (status: number, detail?: string, extensions?: Record<string, unknown>) =>
  new ApiError({
    status,
    ...(detail ? { detail } : {}),
    ...(extensions ? { extensions } : {}),
  })

describe('describeError', () => {
  it('explains network failures, expired sessions and missing items', () => {
    expect(describeError(new ApiError({ status: 0 }))).toMatch(/could not reach the server/)
    expect(describeError(err(401))).toMatch(/session has expired/)
    expect(describeError(err(404, 'Item not found'))).toMatch(/could not find that item/)
  })

  it('turns "already closed" conflicts into a plain sentence', () => {
    expect(describeError(err(409, 'Item is already RESOLVED'))).toBe(
      'This item is already resolved, so nothing was changed.',
    )
  })

  it('hides the service generic validation text but shows specific ones', () => {
    expect(describeError(err(400, 'Invalid request content.'))).toMatch(/Check the fields/)
    expect(describeError(err(400, 'currency is required when amount is given'))).toBe(
      'currency is required when amount is given',
    )
  })

  it('keeps server faults generic and the scheduler message as sent', () => {
    expect(describeError(err(500, 'NullPointerException at ...'))).not.toMatch(/NullPointer/)
    expect(describeError(err(503, 'Please retry.'))).toBe('Please retry.')
    expect(describeError(new Error('boom'))).toMatch(/unexpected/)
  })
})

describe('serverFieldErrors', () => {
  it('reads a map of field to messages', () => {
    expect(
      serverFieldErrors(err(400, 'x', { errors: { title: ['Too short', 'Bad'], amount: 'No' } }))
        .fields,
    ).toEqual({
      title: 'Too short Bad',
      amount: 'No',
    })
  })

  it('reads a list of field/message pairs', () => {
    expect(
      serverFieldErrors(err(400, 'x', { errors: [{ field: 'title', message: 'Required' }] }))
        .fields,
    ).toEqual({
      title: 'Required',
    })
  })

  it('returns nothing when the server sent no field list', () => {
    expect(serverFieldErrors(err(400, 'Invalid request content.')).fields).toEqual({})
    expect(serverFieldErrors(null).fields).toEqual({})
  })
})
