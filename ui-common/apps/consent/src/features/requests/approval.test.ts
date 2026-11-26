import { describe, expect, it } from 'vitest'
import type { AccessRequest, Attribute } from '../../shared/api/types'
import { formatDuration } from '../../shared/lib/format'
import {
  computeVisibility,
  describeTerms,
  validateApproval,
  type ApprovalDraft,
} from './api/approval'

const request: AccessRequest = {
  id: 'r1',
  clientId: 'cl_1',
  clientName: 'Stride',
  scopes: ['profile.name:read', 'profile.sizes:read'],
  purpose: 'Fit',
  durationSeconds: 7 * 86_400,
  maxReads: 20,
  allowedHours: null,
  status: 'PENDING',
  createdAt: '2026-11-19T00:00:00Z',
  decidedAt: null,
  decisionNote: null,
  grantId: null,
  expiresAt: '2026-11-26T00:00:00Z',
}

const draft = (patch: Partial<ApprovalDraft> = {}): ApprovalDraft => ({
  scopes: request.scopes,
  durationAmount: '7',
  durationUnit: 'days',
  maxReads: '',
  maxSensitivity: 'SENSITIVE',
  ...patch,
})

const check = (patch?: Partial<ApprovalDraft>) =>
  validateApproval(request, draft(patch), formatDuration)

describe('validateApproval (narrowing only)', () => {
  it('approves as requested when nothing is changed', () => {
    expect(check().body).toEqual({
      scopes: ['profile.name:read', 'profile.sizes:read'],
      durationSeconds: 604_800,
      maxSensitivity: 'SENSITIVE',
    })
  })

  it('allows narrowing scopes, duration and reads', () => {
    expect(
      check({ scopes: ['profile.sizes:read'], durationAmount: '2', maxReads: '5' }).body,
    ).toEqual({
      scopes: ['profile.sizes:read'],
      durationSeconds: 172_800,
      maxReads: 5,
      maxSensitivity: 'SENSITIVE',
    })
  })

  it('rejects widening and nonsense', () => {
    expect(check({ durationAmount: '8' }).errors.duration).toContain('only shorten')
    expect(check({ durationUnit: 'hours', durationAmount: '0' }).errors.duration).toContain(
      'at least 1',
    )
    expect(check({ durationAmount: 'abc' }).errors.duration).toContain('whole number')
    expect(check({ durationAmount: '1.5' }).errors.duration).toContain('whole number')
    expect(check({ durationUnit: 'minutes', durationAmount: '1' }).body).not.toBeNull()
    expect(check({ maxReads: '21' }).errors.maxReads).toContain('only lower')
    expect(check({ maxReads: '0' }).errors.maxReads).toContain('at least 1')
    expect(check({ scopes: [] }).errors.scopes).toContain('at least one scope')
    expect(check({ scopes: [] }).body).toBeNull()
  })

  it('lets any positive read cap through when the request had no limit', () => {
    const open = { ...request, maxReads: null }
    expect(validateApproval(open, draft({ maxReads: '1000' }), formatDuration).body?.maxReads).toBe(
      1000,
    )
  })
})

describe('describeTerms', () => {
  it('states duration and read limits from the current form', () => {
    expect(describeTerms(request, draft())).toContain('Access lasts 7 days')
    expect(describeTerms(request, draft())).toContain('for at most 20 reads')
    expect(describeTerms(request, draft({ durationAmount: '2', maxReads: '5' }))).toContain(
      'Access lasts 2 days from the moment you approve, for at most 5 reads',
    )
    expect(describeTerms({ ...request, maxReads: null }, draft())).toContain(
      'with no limit on reads',
    )
    expect(describeTerms(request, draft({ durationAmount: '9' }))).toContain(
      'the duration you enter',
    )
  })
})

const attribute = (keyPath: string, sensitivity: Attribute['sensitivity']): Attribute => ({
  keyPath,
  value: 1,
  sensitivity,
  createdAt: '',
  updatedAt: '',
})

describe('computeVisibility', () => {
  const vault = [
    attribute('profile.name', 'PUBLIC'),
    attribute('profile.sizes.shoe', 'PERSONAL'),
    attribute('profile.sizes_secret', 'PERSONAL'),
    attribute('health.allergies', 'SENSITIVE'),
    attribute('health.blood_type', 'RESTRICTED'),
  ]

  it('releases covered attributes up to the ceiling and reports the rest as withheld', () => {
    const v = computeVisibility(vault, ['profile.sizes:read', 'health:read'], 'SENSITIVE')
    expect(v.released.map((a) => a.keyPath)).toEqual(['profile.sizes.shoe', 'health.allergies'])
    expect(v.withheld.map((a) => a.keyPath)).toEqual(['health.blood_type'])
  })

  it('never matches a sibling that merely shares a prefix', () => {
    const v = computeVisibility(vault, ['profile.sizes:read'], 'RESTRICTED')
    expect(v.released.map((a) => a.keyPath)).toEqual(['profile.sizes.shoe'])
  })

  it('shows nothing for no scopes', () => {
    expect(computeVisibility(vault, [], 'RESTRICTED')).toEqual({ released: [], withheld: [] })
  })
})
