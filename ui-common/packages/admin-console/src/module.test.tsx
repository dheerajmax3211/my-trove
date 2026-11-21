import { describe, expect, it } from 'vitest'
import { adminModule } from './index'

describe('adminModule', () => {
  it('has the identity the workspace registry expects', () => {
    expect(adminModule.id).toBe('admin')
    expect(adminModule.service).toBe('auth')
    expect(adminModule.title).toBe('Admin')
    // every screen gates itself, so the module itself must be open to any signed-in person
    expect(adminModule.requiredPermission).toBeUndefined()
    expect(typeof adminModule.Routes).toBe('function')
    expect(typeof adminModule.createDemoFetch).toBe('function')
  })

  it('declares navigation with the permission each screen needs', () => {
    const byLabel = Object.fromEntries(adminModule.nav.map((n) => [n.label, n]))
    expect(adminModule.nav.map((n) => n.label)).toEqual([
      'Overview',
      'Users',
      'Roles',
      'Usage',
      'Audit',
      'Flags',
      'Plans',
    ])
    expect(byLabel.Overview).toMatchObject({ to: '/', end: true })
    expect(byLabel.Overview?.permission).toBeUndefined()
    expect(byLabel.Users?.permission).toBe('users:read')
    expect(byLabel.Roles?.permission).toBe('users:read')
    expect(byLabel.Usage?.permission).toBe('usage:read:all')
    expect(byLabel.Audit?.permission).toBe('audit:read')
    expect(byLabel.Flags?.permission).toBe('flags:manage')
    expect(byLabel.Plans?.permission).toBe('usage:read:all')
    for (const item of adminModule.nav) expect(item.to.startsWith('/')).toBe(true)
  })

  it('createDemoFetch returns a working fetch', async () => {
    const f = adminModule.createDemoFetch?.()
    const response = await f?.('http://gw.test/api/auth/v1/admin/roles')
    expect(response?.status).toBe(200)
  })
})
