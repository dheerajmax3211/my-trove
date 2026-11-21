import { describe, expect, it } from 'vitest'
import { defaultPolicy } from '../../lib/policyDefaults'
import { DAY, HOUR } from '../../lib/format'
import {
  contactError,
  inputToSeconds,
  policyToInput,
  secondsToInput,
  validatePolicyInput,
  type PolicyInput,
} from './policyForm'
import { buildPreview } from './timelinePreview'

const valid = (): PolicyInput => policyToInput(defaultPolicy('me@example.com'))

describe('duration inputs', () => {
  it('prefers days when the value is a whole number of days, hours otherwise', () => {
    expect(secondsToInput(7 * DAY)).toEqual({ value: '7', unit: 'days' })
    expect(secondsToInput(36 * HOUR)).toEqual({ value: '36', unit: 'hours' })
    expect(secondsToInput(90 * 60)).toEqual({ value: '1.5', unit: 'hours' })
    expect(secondsToInput(0)).toEqual({ value: '0', unit: 'hours' })
  })

  it('round-trips and rejects non-numbers', () => {
    expect(inputToSeconds({ value: '1.5', unit: 'hours' })).toBe(5400)
    expect(inputToSeconds({ value: '2', unit: 'days' })).toBe(2 * DAY)
    for (const bad of ['', 'abc', '-1', '1e3', '1,5'])
      expect(inputToSeconds({ value: bad, unit: 'days' })).toBeNull()
  })
})

describe('policy validation (mirrors the service)', () => {
  it('accepts the default policy and carries the quorum through', () => {
    const { policy, errors } = validatePolicyInput(valid(), 3)
    expect(errors).toEqual({})
    expect(policy?.quorum).toBe(3)
    expect(policy?.checkInIntervalSeconds).toBe(7 * DAY)
    expect(policy?.steps).toHaveLength(4)
    expect(policy?.ownerContacts).toEqual([{ channel: 'EMAIL', address: 'me@example.com' }])
  })

  it('reports interval, grace, cool-off and pause limits', () => {
    const input = valid()
    input.interval = { value: '0.5', unit: 'hours' }
    input.grace = { value: '91', unit: 'days' }
    input.coolOff = { value: '31', unit: 'days' }
    input.maxPause = { value: '61', unit: 'days' }
    const { policy, errors } = validatePolicyInput(input, 2)
    expect(policy).toBeNull()
    expect(errors.interval).toMatch(/between 1 hours and 366 days/)
    expect(errors.grace).toMatch(/90 days/)
    expect(errors.coolOff).toMatch(/30 days/)
    expect(errors.maxPause).toMatch(/60 days/)
  })

  it('requires strictly increasing steps, non-decreasing urgency and channels', () => {
    const input = valid()
    input.steps = [
      {
        offset: { value: '2', unit: 'days' },
        urgency: 'URGENT',
        audience: 'ALL',
        channels: ['EMAIL'],
      },
      { offset: { value: '1', unit: 'days' }, urgency: 'NOTICE', audience: 'OWNER', channels: [] },
    ]
    const { errors } = validatePolicyInput(input, 2)
    expect(errors['step.1.offset']).toMatch(/after the one before/)
    expect(errors['step.1.urgency']).toMatch(/never fall/)
    expect(errors['step.1.channels']).toMatch(/at least one/)
  })

  it('requires the escalation to reach the last step, and at least one step', () => {
    const input = valid()
    input.escalation = { value: '2', unit: 'days' }
    expect(validatePolicyInput(input, 2).errors.escalation).toMatch(/last reminder/)
    input.steps = []
    expect(validatePolicyInput(input, 2).errors.steps).toMatch(/at least one/)
  })

  it('validates and de-duplicates owner contacts', () => {
    expect(contactError({ channel: 'EMAIL', address: 'nope' })).toMatch(/valid email/)
    expect(contactError({ channel: 'SMS', address: '0123' })).toMatch(/international format/)
    expect(contactError({ channel: 'SMS', address: '+14155550123' })).toBeNull()
    expect(contactError({ channel: 'PUSH', address: 'short' })).toMatch(/8 characters/)
    expect(contactError({ channel: 'EMAIL', address: '' })).toMatch(/Enter an address/)
    const input = valid()
    input.contacts = [
      { channel: 'EMAIL', address: 'a@example.com' },
      { channel: 'EMAIL', address: 'a@example.com' },
    ]
    expect(validatePolicyInput(input, 2).errors['contact.1']).toMatch(/already added/)
    input.contacts = []
    expect(validatePolicyInput(input, 2).errors.contacts).toMatch(/at least one/)
  })
})

describe('timeline preview', () => {
  it('lays the periods end to end and finds the earliest possible release', () => {
    const preview = buildPreview({ ...defaultPolicy('a@example.com'), quorum: 2 })
    expect(preview.segments.map((s) => [s.kind, s.startSeconds / DAY, s.endSeconds / DAY])).toEqual(
      [
        ['quiet', 0, 7],
        ['grace', 7, 10],
        ['escalation', 10, 17],
        ['vote', 17, 20],
      ],
    )
    expect(preview.earliestReleaseSeconds).toBe(20 * DAY)
    expect(preview.steps.map((s) => s.atSeconds / DAY)).toEqual([10, 11, 13, 16])
    expect(preview.segments[3]?.description).toContain('Once 2 approve')
  })
})
