import { describe, expect, it } from 'vitest'
import { canChangeRole, canLeave, canRemoveMember, isLastOwner, ownerCount } from './rules'
import type { Member } from './types'

const m = (uid: string, role: Member['role']): Member => ({
  uid,
  role,
  joinedAt: '2026-01-01T00:00:00Z',
})
const solo = [m('a', 'OWNER'), m('b', 'MEMBER')]
const duo = [m('a', 'OWNER'), m('b', 'OWNER'), m('c', 'MEMBER')]

describe('household rules', () => {
  it('counts owners and finds the last one', () => {
    expect(ownerCount(duo)).toBe(2)
    expect(isLastOwner(solo, 'a')).toBe(true)
    expect(isLastOwner(solo, 'b')).toBe(false)
    expect(isLastOwner(duo, 'a')).toBe(false)
  })
  it('blocks the only owner from leaving, with a reason', () => {
    const rule = canLeave(solo, 'a')
    expect(rule.allowed).toBe(false)
    expect(rule.reason).toMatch(/only owner/)
    expect(canLeave(duo, 'a').allowed).toBe(true)
    expect(canLeave(solo, 'b').allowed).toBe(true)
  })
  it('blocks demoting or removing the only owner, and non-owners from managing', () => {
    expect(canChangeRole('OWNER', solo, solo[0]!).allowed).toBe(false)
    expect(canRemoveMember('OWNER', solo, solo[0]!).allowed).toBe(false)
    expect(canChangeRole('OWNER', solo, solo[1]!).allowed).toBe(true)
    expect(canRemoveMember('OWNER', duo, duo[0]!).allowed).toBe(true)
    expect(canChangeRole('MEMBER', duo, duo[2]!).allowed).toBe(false)
    expect(canRemoveMember('MEMBER', duo, duo[2]!).reason).toMatch(/Only owners/)
  })
})
