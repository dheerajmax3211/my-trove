import { describe, expect, it } from 'vitest'
import { createAdminDemoFetch } from './demoFetch'
import { demoId } from './seed'

const GW = 'http://gw.test/api'

function client(token = 'demo:OWNER:1') {
  const f = createAdminDemoFetch()
  const call = async (method: string, url: string, body?: unknown) => {
    const response = await f(url.startsWith('http') ? url : `${GW}${url}`, {
      method,
      headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
    })
    const text = await response.text()
    return { status: response.status, body: text ? (JSON.parse(text) as unknown) : undefined }
  }
  return call
}

const A = '/auth'
const P = '/auth/../platform' // exactly what the console sends for the platform service

describe('createAdminDemoFetch serves every endpoint the screens use', () => {
  it('auth: users, user, roles, lookup, audit', async () => {
    const call = client()
    expect((await call('GET', `${A}/v1/admin/users?page=0&size=5`)).status).toBe(200)
    expect((await call('GET', `${A}/v1/admin/users/${demoId(2)}`)).status).toBe(200)
    expect((await call('GET', `${A}/v1/admin/roles`)).status).toBe(200)
    expect(
      (await call('GET', `${A}/v1/admin/users/lookup?ids=${demoId(1)},${demoId(2)}`)).status,
    ).toBe(200)
    expect((await call('GET', `${A}/v1/admin/audit?page=0&size=5`)).status).toBe(200)
  })

  it('platform (reached through the ../platform path): summary, top users, me, flags, evaluate', async () => {
    const call = client()
    const range = `from=${encodeURIComponent('2026-11-20T00:00:00Z')}&to=${encodeURIComponent('2026-11-21T00:00:00Z')}`
    const summary = await call('GET', `${A}/v1/usage/summary?${range}`.replace(A, P))
    expect(summary.status).toBe(200)
    const s = summary.body as {
      totalRequests: number
      series: unknown[]
      byService: unknown[]
      resolution: string
    }
    expect(s.totalRequests).toBeGreaterThan(0)
    expect(s.series.length).toBeGreaterThan(10)
    expect(s.byService).toHaveLength(6)
    expect(s.resolution).toBe('1h')
    expect((await call('GET', `${P}/v1/usage/top-users?${range}&limit=5`)).status).toBe(200)
    expect((await call('GET', `${P}/v1/usage/me?${range}`)).status).toBe(200)
    expect((await call('GET', `${P}/v1/flags`)).status).toBe(200)
    expect((await call('GET', `${P}/v1/flags/evaluate`)).status).toBe(200)
  })

  it('usage numbers are internally consistent: service parts add up to the total', async () => {
    const call = client()
    const { body } = await call(
      'GET',
      `${P}/v1/usage/summary?from=${encodeURIComponent('2026-11-14T00:00:00Z')}&to=${encodeURIComponent('2026-11-21T00:00:00Z')}`,
    )
    const s = body as {
      totalRequests: number
      byService: { requests: number; errors: number }[]
      byStatusClass: Record<string, number>
      errorRate: number
    }
    expect(s.byService.reduce((a, b) => a + b.requests, 0)).toBe(s.totalRequests)
    expect(Object.values(s.byStatusClass).reduce((a, b) => a + b, 0)).toBe(s.totalRequests)
    expect(s.byStatusClass['5xx'] ?? 0).toBe(Math.round(s.errorRate * s.totalRequests))
  })
})

describe('permissions', () => {
  it('answers 403 when the token lacks the permission', async () => {
    const member = client('demo:MEMBER:5')
    expect((await member('GET', `${A}/v1/admin/users`)).status).toBe(403)
    expect((await member('GET', `${P}/v1/usage/summary`)).status).toBe(403)
    expect((await member('GET', `${P}/v1/flags`)).status).toBe(403)
    expect((await member('GET', `${P}/v1/usage/me`)).status).toBe(200)
    const auditor = client('demo:AUDITOR+MEMBER:3')
    expect((await auditor('GET', `${A}/v1/admin/audit`)).status).toBe(200)
    expect((await auditor('POST', `${A}/v1/admin/users/${demoId(6)}/suspend`)).status).toBe(403)
  })
})

describe('guardrails match the auth service', () => {
  it('only an owner may grant ADMIN, and the server message is the one the backend uses', async () => {
    const admin = client('demo:ADMIN+MEMBER:2')
    const r = await admin('PUT', `${A}/v1/admin/users/${demoId(6)}/roles/ADMIN`)
    expect(r.status).toBe(403)
    expect(r.body).toMatchObject({
      code: 'PRIVILEGED_ROLE_REQUIRED',
      detail: 'Only an OWNER can grant or revoke ADMIN or OWNER, or change an ADMIN or OWNER',
    })
    expect((await admin('PUT', `${A}/v1/admin/users/${demoId(6)}/roles/DEVELOPER`)).status).toBe(
      200,
    )
    // an admin cannot touch an admin either
    expect((await admin('PUT', `${A}/v1/admin/users/${demoId(2)}/roles/DEVELOPER`)).status).toBe(
      403,
    )
  })

  it('the MEMBER role cannot be revoked, the last owner cannot be removed or suspended, nobody suspends themselves', async () => {
    const owner = client()
    expect(
      (await owner('DELETE', `${A}/v1/admin/users/${demoId(6)}/roles/MEMBER`)).body,
    ).toMatchObject({
      code: 'BASELINE_ROLE',
    })
    const last = await owner('DELETE', `${A}/v1/admin/users/${demoId(1)}/roles/OWNER`)
    expect(last.status).toBe(409)
    expect(last.body).toMatchObject({ code: 'LAST_OWNER' })
    expect((await owner('POST', `${A}/v1/admin/users/${demoId(1)}/suspend`)).body).toMatchObject({
      code: 'LAST_OWNER',
    })
    // with a second owner, the first may be demoted, but never suspend themselves
    await owner('PUT', `${A}/v1/admin/users/${demoId(6)}/roles/OWNER`)
    expect((await owner('POST', `${A}/v1/admin/users/${demoId(1)}/suspend`)).body).toMatchObject({
      code: 'SELF_SUSPEND',
    })
  })

  it('grant, suspend, restore and plan changes update the user and write the audit log', async () => {
    const owner = client()
    const id = demoId(7)
    await owner('PUT', `${A}/v1/admin/users/${id}/roles/DEVELOPER`)
    await owner('POST', `${A}/v1/admin/users/${id}/suspend`)
    const user = (await owner('PUT', `${A}/v1/admin/users/${id}/plan/PRO`)).body as {
      roles: string[]
      suspended: boolean
      plan: string
      permissionsVersion: number
    }
    expect(user).toMatchObject({ plan: 'PRO', suspended: true })
    expect(user.roles).toContain('DEVELOPER')
    expect(user.permissionsVersion).toBe(4)
    await owner('POST', `${A}/v1/admin/users/${id}/restore`)
    const audit = (await owner('GET', `${A}/v1/admin/audit?targetId=${id}`)).body as {
      items: { action: string }[]
    }
    expect(audit.items.map((e) => e.action)).toEqual([
      'USER_RESTORED',
      'PLAN_CHANGED',
      'USER_SUSPENDED',
      'ROLE_GRANTED',
    ])
    expect((await owner('PUT', `${A}/v1/admin/users/${id}/plan/GOLD`)).status).toBe(400)
  })
})

describe('lookup', () => {
  it('accepts up to 100 ids, rejects more, rejects bad ids and omits unknown ones', async () => {
    const call = client()
    const ids = Array.from({ length: 101 }, (_, n) => demoId(n + 1))
    expect(
      (await call('GET', `${A}/v1/admin/users/lookup?ids=${ids.join(',')}`)).body,
    ).toMatchObject({
      code: 'TOO_MANY_IDS',
    })
    expect((await call('GET', `${A}/v1/admin/users/lookup?ids=nope`)).body).toMatchObject({
      code: 'INVALID_ID',
    })
    const ok = await call('GET', `${A}/v1/admin/users/lookup?ids=${demoId(1)},${demoId(9999)}`)
    expect((ok.body as unknown[]).length).toBe(1)
    expect(ok.body).not.toContainEqual(
      expect.objectContaining({ firebaseUid: expect.anything() as unknown }),
    )
  })
})

describe('users and audit paging', () => {
  it('filters by name or email and pages', async () => {
    const call = client()
    const all = (await call('GET', `${A}/v1/admin/users?size=10&page=1`)).body as {
      total: number
      items: unknown[]
      page: number
    }
    expect(all.total).toBe(24)
    expect(all.items).toHaveLength(10)
    expect(all.page).toBe(1)
    const found = (await call('GET', `${A}/v1/admin/users?q=PRIYA`)).body as { total: number }
    expect(found.total).toBe(1)
    expect((await call('GET', `${A}/v1/admin/users?size=500`)).status).toBe(400)
  })
})

describe('flags', () => {
  it('creates, rejects duplicates and bad keys, updates, evaluates and deletes', async () => {
    const call = client()
    const created = await call('POST', `${P}/v1/flags`, {
      key: 'beta-x',
      enabled: true,
      rolloutPercent: 100,
    })
    expect(created.status).toBe(201)
    expect((await call('POST', `${P}/v1/flags`, { key: 'beta-x' })).status).toBe(409)
    expect((await call('POST', `${P}/v1/flags`, { key: 'Bad Key' })).status).toBe(400)
    expect(
      (
        await call('PUT', `${P}/v1/flags/beta-x`, {
          enabled: false,
          rolloutPercent: 30,
          description: 'd',
        })
      ).body,
    ).toMatchObject({
      enabled: false,
      rolloutPercent: 30,
    })
    const evaluated = (await call('GET', `${P}/v1/flags/evaluate`)).body as {
      flags: Record<string, boolean>
    }
    expect(evaluated.flags['beta-x']).toBe(false)
    expect((await call('DELETE', `${P}/v1/flags/beta-x`)).status).toBe(204)
    expect((await call('DELETE', `${P}/v1/flags/beta-x`)).status).toBe(404)
  })
})
