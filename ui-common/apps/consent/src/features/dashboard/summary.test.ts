import { describe, expect, it } from 'vitest'
import type { Attribute } from '../../shared/api/types'
import { describeAsk } from '../../shared/lib/requests'
import { homeSummary, leaseElapsed, sensitivityCounts, vaultGroups } from './summary'

const attr = (keyPath: string, sensitivity: Attribute['sensitivity'] = 'PERSONAL'): Attribute => ({
  keyPath,
  value: 1,
  sensitivity,
  createdAt: '2026-01-01T00:00:00Z',
  updatedAt: '2026-01-01T00:00:00Z',
})

describe('homeSummary', () => {
  it('says the whole picture in two sentences', () => {
    expect(homeSummary(0, 0)).toBe(
      'Nothing is waiting for your decision. No app can read your vault right now.',
    )
    expect(homeSummary(1, 1)).toBe(
      '1 request is waiting for your decision. 1 app can read part of your vault right now.',
    )
    expect(homeSummary(3, 2)).toContain('3 requests are waiting')
    expect(homeSummary(3, 2)).toContain('2 apps can read')
  })
})

describe('vault summary', () => {
  const attributes = [
    attr('profile.name'),
    attr('profile.sizes.shoe'),
    attr('health.allergies', 'SENSITIVE'),
  ]
  it('counts attributes per top-level group', () => {
    expect(vaultGroups(attributes)).toEqual([
      { name: 'health', count: 1 },
      { name: 'profile', count: 2 },
    ])
  })
  it('counts attributes per sensitivity, leaving out empty levels', () => {
    expect(sensitivityCounts(attributes)).toEqual([
      { level: 'PERSONAL', count: 2 },
      { level: 'SENSITIVE', count: 1 },
    ])
  })
})

describe('leaseElapsed', () => {
  const grant = { createdAt: '2026-01-01T00:00:00Z', expiresAt: '2026-01-11T00:00:00Z' }
  it('is the share of the grant that has passed, clamped to 0..1', () => {
    expect(leaseElapsed(grant, Date.parse('2026-01-06T00:00:00Z'))).toBeCloseTo(0.5)
    expect(leaseElapsed(grant, Date.parse('2025-12-01T00:00:00Z'))).toBe(0)
    expect(leaseElapsed(grant, Date.parse('2026-03-01T00:00:00Z'))).toBe(1)
  })
})

describe('describeAsk', () => {
  it('names how much, how long and how often in a sentence', () => {
    expect(describeAsk({ scopes: ['a:read'], durationSeconds: 86_400, maxReads: null })).toBe(
      'Wants to read one part of your vault for 1 day.',
    )
    expect(
      describeAsk({ scopes: ['a:read', 'b:read'], durationSeconds: 7 * 86_400, maxReads: 1 }),
    ).toBe('Wants to read 2 parts of your vault for 7 days, up to 1 read.')
  })
})
