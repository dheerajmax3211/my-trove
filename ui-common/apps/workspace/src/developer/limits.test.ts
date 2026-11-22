import { describe, expect, it } from 'vitest'
import { capacity, limitsFor } from './limits'

describe('limitsFor', () => {
  it('uses the platform plan table for keys and webhook endpoints', () => {
    expect(limitsFor('FREE')).toEqual({ keys: 3, webhooks: 1 })
    expect(limitsFor('PRO')).toEqual({ keys: 10, webhooks: 5 })
    expect(limitsFor('DEVELOPER')).toEqual({ keys: 50, webhooks: 20 })
  })

  it('is case-insensitive and falls back to FREE for a plan it does not know', () => {
    expect(limitsFor('pro')).toEqual({ keys: 10, webhooks: 5 })
    expect(limitsFor('UNKNOWN')).toEqual({ keys: 3, webhooks: 1 })
  })
})

describe('capacity', () => {
  it('reports how much of a limit is used and whether it is full', () => {
    expect(capacity(2, 3)).toEqual({ used: 2, limit: 3, remaining: 1, full: false })
    expect(capacity(3, 3)).toEqual({ used: 3, limit: 3, remaining: 0, full: true })
  })
})
