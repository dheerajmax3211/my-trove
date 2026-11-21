import { describe, expect, it } from 'vitest'
import { createMockBackend, DEMO_TOKEN_PREFIX } from './backend'
import { DEMO_USERS } from './seed'
import { nextOccurrenceAfter } from './schedule'

const NOW = Date.parse('2026-11-19T09:00:00Z')
const [ALICE, BOB] = DEMO_USERS

/** The response fields these tests read; everything else is checked with toMatchObject. */
interface Body {
  id: string
  code: string
  role: string
  url: string
  roles: string[]
  detail: string
  sha256: string
  items: { action: string; details: { title?: string } }[]
}

function setup(seed: 'demo' | 'empty' = 'empty') {
  const backend = createMockBackend({ now: () => NOW, seed })
  const call = async (uid: string | null, method: string, path: string, body?: unknown) => {
    const headers = new Headers()
    if (uid) headers.set('authorization', `Bearer ${DEMO_TOKEN_PREFIX}${uid}`)
    let payload: BodyInit | undefined
    if (body instanceof FormData) payload = body
    else if (body !== undefined) {
      payload = JSON.stringify(body)
      headers.set('content-type', 'application/json')
    }
    const response = await backend.fetch(`/api${path}`, {
      method,
      headers,
      ...(payload === undefined ? {} : { body: payload }),
    })
    const text = await response.text()
    return {
      status: response.status,
      type: response.headers.get('content-type'),
      json: text ? (JSON.parse(text) as Body) : null,
    }
  }
  return { backend, call }
}

describe('mock backend: auth-service contract', () => {
  it('rejects a missing token with an empty 401', async () => {
    const { call } = setup()
    const res = await call(null, 'GET', '/auth/v1/me')
    expect(res).toMatchObject({ status: 401, json: null })
  })

  it('returns the profile with roles and provisions unknown users as USER', async () => {
    const { call } = setup()
    expect((await call('demo-alice', 'POST', '/auth/v1/auth/session')).json).toMatchObject({
      email: 'alice@example.test',
      roles: ['ADMIN', 'USER'],
    })
    expect((await call('someone-new', 'GET', '/auth/v1/me')).json).toMatchObject({
      roles: ['USER'],
    })
  })

  it('hides admin endpoints from non-admins with an empty 403', async () => {
    const { call } = setup()
    const res = await call('demo-bob', 'GET', `/auth/v1/admin/users/${ALICE!.userId}`)
    expect(res).toMatchObject({ status: 403, json: null })
  })

  it('answers admin errors in Spring Boot error shape, without a message', async () => {
    const { call } = setup()
    const notFound = await call(
      'demo-alice',
      'GET',
      '/auth/v1/admin/users/0198a1ce-0000-7000-8000-0000000000ff',
    )
    expect(notFound.status).toBe(404)
    expect(notFound.json).toMatchObject({ status: 404, error: 'Not Found' })
    expect(notFound.json).not.toHaveProperty('detail')
    expect((await call('demo-alice', 'GET', '/auth/v1/admin/users/not-a-uuid')).status).toBe(400)
  })

  it('enforces the guardrails: USER and your own ADMIN cannot be revoked', async () => {
    const { call } = setup()
    const base = `/auth/v1/admin/users`
    expect((await call('demo-alice', 'DELETE', `${base}/${BOB!.userId}/roles/USER`)).status).toBe(
      400,
    )
    expect(
      (await call('demo-alice', 'DELETE', `${base}/${ALICE!.userId}/roles/ADMIN`)).status,
    ).toBe(400)
    expect((await call('demo-alice', 'PUT', `${base}/${BOB!.userId}/roles/NOPE`)).status).toBe(404)
    const granted = await call('demo-alice', 'PUT', `${base}/${BOB!.userId}/roles/ADMIN`)
    expect(granted.json?.roles).toEqual(['ADMIN', 'USER'])
    const revoked = await call('demo-alice', 'DELETE', `${base}/${BOB!.userId}/roles/ADMIN`)
    expect(revoked.json?.roles).toEqual(['USER'])
  })
})

describe('mock backend: shared-service contract', () => {
  const makeHousehold = async (call: ReturnType<typeof setup>['call']) =>
    (await call('demo-alice', 'POST', '/shared/v1/households', { name: '  Home  ' })).json!

  it('creates a household as OWNER, trims the name and answers errors as ProblemDetail', async () => {
    const { call } = setup()
    const created = await call('demo-alice', 'POST', '/shared/v1/households', { name: '  Home  ' })
    expect(created).toMatchObject({ status: 201, json: { name: 'Home', role: 'OWNER' } })

    const blank = await call('demo-alice', 'POST', '/shared/v1/households', { name: '   ' })
    expect(blank.status).toBe(400)
    expect(blank.type).toBe('application/problem+json')
    expect(blank.json).toMatchObject({ title: 'Bad Request', detail: 'Invalid request content.' })
  })

  it('answers 404 to non-members, 403 to members without the role', async () => {
    const { call } = setup()
    const h = await makeHousehold(call)
    expect((await call('demo-bob', 'GET', `/shared/v1/households/${h.id}`)).status).toBe(404)
    const invite = (await call('demo-alice', 'POST', `/shared/v1/households/${h.id}/invites`, {}))
      .json!
    await call('demo-bob', 'POST', '/shared/v1/invites/accept', { code: invite.code })
    expect((await call('demo-bob', 'GET', `/shared/v1/households/${h.id}/invites`)).status).toBe(
      403,
    )
  })

  it('redeems an invite once; a used or unknown code is 410 and a member gets 409 without burning it', async () => {
    const { call } = setup()
    const h = await makeHousehold(call)
    const url = `/shared/v1/households/${h.id}/invites`
    const first = (await call('demo-alice', 'POST', url, { role: 'OWNER', ttlHours: 2 })).json!
    expect(first.role).toBe('OWNER')

    expect(
      (await call('demo-alice', 'POST', '/shared/v1/invites/accept', { code: first.code })).status,
    ).toBe(409)
    const joined = await call('demo-bob', 'POST', '/shared/v1/invites/accept', { code: first.code })
    expect(joined).toMatchObject({ status: 200, json: { id: h.id, role: 'OWNER' } })
    expect(
      (await call('demo-bob', 'POST', '/shared/v1/invites/accept', { code: first.code })).status,
    ).toBe(410)
    expect(
      (await call('demo-bob', 'POST', '/shared/v1/invites/accept', { code: 'nope' })).status,
    ).toBe(410)
  })

  it('protects the last owner from leaving, removal and demotion', async () => {
    const { call } = setup()
    const h = await makeHousehold(call)
    const base = `/shared/v1/households/${h.id}`
    expect((await call('demo-alice', 'POST', `${base}/leave`)).status).toBe(409)
    expect((await call('demo-alice', 'DELETE', `${base}/members/demo-alice`)).status).toBe(409)
    const demote = await call('demo-alice', 'PUT', `${base}/members/demo-alice/role`, {
      role: 'MEMBER',
    })
    expect(demote.status).toBe(409)
    expect(demote.json?.detail).toMatch(/last owner/)
  })

  it('validates reminders and returns recurrence and status', async () => {
    const { call } = setup()
    const due = '2026-11-20T10:00:00Z'
    expect(
      (await call('demo-alice', 'POST', '/shared/v1/reminders', { title: '', dueAt: due })).status,
    ).toBe(400)
    expect(
      (
        await call('demo-alice', 'POST', '/shared/v1/reminders', {
          title: 'x',
          dueAt: due,
          recurrence: { unit: 'DAILY', interval: 0 },
        })
      ).status,
    ).toBe(400)
    const ok = await call('demo-alice', 'POST', '/shared/v1/reminders', {
      title: 'Water plants',
      dueAt: due,
      recurrence: { unit: 'WEEKLY' },
    })
    expect(ok).toMatchObject({
      status: 201,
      json: {
        status: 'ACTIVE',
        householdId: null,
        recurrence: { unit: 'WEEKLY', interval: 1 },
        lastFiredAt: null,
      },
    })
  })

  it('fires due reminders: one-offs complete, recurring ones move to the next occurrence', async () => {
    const { backend, call } = setup()
    const oneOff = (
      await call('demo-alice', 'POST', '/shared/v1/reminders', {
        title: 'Once',
        dueAt: '2026-11-20T09:00:00Z',
      })
    ).json!
    const daily = (
      await call('demo-alice', 'POST', '/shared/v1/reminders', {
        title: 'Daily',
        dueAt: '2026-11-20T09:00:00Z',
        recurrence: { unit: 'DAILY', interval: 1 },
      })
    ).json!
    backend.advanceClock(2 * 86_400_000 + 1000)
    const list = (await call('demo-alice', 'GET', '/shared/v1/reminders')).json as unknown as Array<
      Record<string, unknown>
    >
    expect(list.find((r) => r.id === oneOff.id)).toMatchObject({ status: 'COMPLETED' })
    expect(list.find((r) => r.id === daily.id)).toMatchObject({
      status: 'ACTIVE',
      dueAt: '2026-11-22T09:00:00.000Z',
    })
    expect(
      (
        await call('demo-alice', 'PUT', `/shared/v1/reminders/${oneOff.id}`, {
          title: 'x',
          dueAt: '2026-12-01T09:00:00Z',
        })
      ).status,
    ).toBe(409)
  })

  it('accepts uploads, issues expiring signed links and refuses tampered or expired ones', async () => {
    const { backend, call } = setup()
    const form = new FormData()
    form.append('file', new File(['hello'], 'notes.txt', { type: 'text/plain' }))
    const uploaded = await call('demo-alice', 'POST', '/shared/v1/files', form)
    expect(uploaded).toMatchObject({ status: 201, json: { name: 'notes.txt', sizeBytes: 5 } })
    expect(uploaded.json?.sha256).toBe(
      '2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824',
    )

    const link = (
      await call('demo-alice', 'POST', `/shared/v1/files/${uploaded.json?.id}/download-link`, {
        ttlSeconds: 60,
      })
    ).json!
    const download = await backend.fetch(`/api/shared${link.url}`)
    expect(download.status).toBe(200)
    expect(download.headers.get('content-disposition')).toContain('attachment')
    expect(await download.text()).toBe('hello')

    const tampered = await backend.fetch(`/api/shared${link.url.replace('mock.', 'mock.x')}`)
    expect(tampered.status).toBe(403)
    backend.advanceClock(61_000)
    expect((await backend.fetch(`/api/shared${link.url}`)).status).toBe(403)
    expect(
      (
        await call('demo-alice', 'POST', `/shared/v1/files/${uploaded.json?.id}/download-link`, {
          ttlSeconds: 7200,
        })
      ).status,
    ).toBe(400)
  })

  it('pages the audit log newest first and scopes personal vs household events', async () => {
    const { call } = setup()
    const h = await makeHousehold(call)
    for (let i = 0; i < 5; i++)
      await call('demo-alice', 'POST', '/shared/v1/reminders', {
        title: `r${i}`,
        dueAt: '2026-12-01T09:00:00Z',
      })
    const page0 = (await call('demo-alice', 'GET', '/shared/v1/audit?size=2&page=0')).json!
    expect(page0).toMatchObject({ total: 5, page: 0, size: 2 })
    expect(page0.items.map((e) => e.details.title)).toEqual(['r4', 'r3'])
    const page2 = (await call('demo-alice', 'GET', '/shared/v1/audit?size=2&page=2')).json!
    expect(page2.items).toHaveLength(1)
    const household = (await call('demo-alice', 'GET', `/shared/v1/audit?householdId=${h.id}`))
      .json!
    expect(household.items.map((e) => e.action)).toEqual(['household.created'])
    expect((await call('demo-bob', 'GET', `/shared/v1/audit?householdId=${h.id}`)).status).toBe(404)
  })

  it('seeds a lived-in demo account', async () => {
    const { call } = setup('demo')
    const households = (await call('demo-alice', 'GET', '/shared/v1/households'))
      .json as unknown as unknown[]
    expect(households).toHaveLength(1)
    const reminders = (await call('demo-alice', 'GET', '/shared/v1/reminders?status=ACTIVE'))
      .json as unknown as unknown[]
    expect(reminders).toHaveLength(3)
  })
})

describe('nextOccurrenceAfter', () => {
  const at = (iso: string) => Date.parse(iso)
  it('keeps monthly rules anchored: Jan 31, Feb 28, Mar 31 (no drift)', () => {
    const rule = { unit: 'MONTHLY', interval: 1 } as const
    const anchor = at('2027-01-31T08:00:00Z')
    expect(new Date(nextOccurrenceAfter(rule, anchor, anchor)).toISOString()).toBe(
      '2027-02-28T08:00:00.000Z',
    )
    expect(
      new Date(nextOccurrenceAfter(rule, anchor, at('2027-02-28T08:00:00Z'))).toISOString(),
    ).toBe('2027-03-31T08:00:00.000Z')
  })
  it('skips missed occurrences and honours the interval', () => {
    const rule = { unit: 'WEEKLY', interval: 2 } as const
    const anchor = at('2026-11-01T10:00:00Z')
    expect(
      new Date(nextOccurrenceAfter(rule, anchor, at('2026-12-20T00:00:00Z'))).toISOString(),
    ).toBe('2026-12-27T10:00:00.000Z')
  })
})
