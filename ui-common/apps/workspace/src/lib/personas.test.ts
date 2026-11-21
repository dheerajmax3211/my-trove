import { describe, expect, it } from 'vitest'
import {
  ALL_PERMISSIONS,
  PERSONA_PERMISSIONS,
  groupPermissions,
  planInfo,
  primaryPersona,
} from './personas'

describe('persona permissions (design 5.2)', () => {
  it('gives MEMBER the three base permissions', () => {
    expect([...PERSONA_PERMISSIONS.MEMBER].sort()).toEqual(
      ['connections:manage', 'products:use', 'usage:read:self'].sort(),
    )
  })

  it('adds the developer tools to DEVELOPER and nothing administrative', () => {
    const developer = PERSONA_PERMISSIONS.DEVELOPER
    for (const permission of [
      'apps:manage',
      'keys:manage',
      'webhooks:manage',
      'sandbox:use',
      'logs:read:own',
      'workspaces:manage',
    ]) {
      expect(developer).toContain(permission)
    }
    expect(developer).not.toContain('users:read')
  })

  it('keeps AUDITOR read-only and without products:use', () => {
    expect([...PERSONA_PERMISSIONS.AUDITOR].sort()).toEqual(
      ['apps:read:all', 'audit:read', 'usage:read:all', 'users:read'].sort(),
    )
  })

  it('does not let ADMIN grant privileged roles or change plans', () => {
    expect(PERSONA_PERMISSIONS.ADMIN).not.toContain('roles:assign:privileged')
    expect(PERSONA_PERMISSIONS.ADMIN).not.toContain('plans:manage')
    expect(PERSONA_PERMISSIONS.ADMIN).toContain('support:impersonate')
  })

  it('gives OWNER every permission', () => {
    expect([...PERSONA_PERMISSIONS.OWNER].sort()).toEqual([...ALL_PERMISSIONS].sort())
  })
})

describe('primaryPersona', () => {
  it('picks the highest role and falls back to MEMBER', () => {
    expect(primaryPersona(['MEMBER', 'DEVELOPER'])).toBe('DEVELOPER')
    expect(primaryPersona(['ADMIN', 'OWNER'])).toBe('OWNER')
    expect(primaryPersona(['member'])).toBe('MEMBER')
    expect(primaryPersona(['SOMETHING_ELSE'])).toBe('MEMBER')
    expect(primaryPersona([])).toBe('MEMBER')
  })
})

describe('groupPermissions', () => {
  it('groups by area, drops empty groups and keeps unknown permissions under Other', () => {
    const groups = groupPermissions(['products:use', 'audit:read', 'future:thing'])
    expect(groups.map((g) => g.title)).toEqual(['Products and your data', 'Oversight', 'Other'])
    expect(groups[2]?.permissions).toEqual(['future:thing'])
  })
})

describe('planInfo', () => {
  it('knows the three plans from the platform design', () => {
    expect(planInfo('FREE')).toMatchObject({ perMinute: 120, perMonth: 10_000 })
    expect(planInfo('PRO')).toMatchObject({ perMinute: 600, perMonth: 200_000 })
    expect(planInfo('DEVELOPER')).toMatchObject({ perMinute: 1_200, perMonth: 1_000_000 })
    expect(planInfo('MYSTERY')).toBeNull()
  })
})
