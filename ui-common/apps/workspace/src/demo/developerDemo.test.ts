import { describe, expect, it } from 'vitest'
import { createDeveloperDemo, type DemoCall } from './developerDemo'

const NOW = new Date('2026-11-21T10:00:00Z')
const DEV_PERMISSIONS = [
  'products:use',
  'usage:read:self',
  'connections:manage',
  'apps:manage',
  'keys:manage',
  'webhooks:manage',
]
const MEMBER_PERMISSIONS = ['products:use', 'usage:read:self', 'connections:manage']

function demo() {
  return createDeveloperDemo({ now: () => NOW, usage: () => ({ totalRequests: 7 }) })
}

async function call(api: ReturnType<typeof demo>, input: Partial<DemoCall> & { path: string }) {
  const response = api.handle({
    method: 'GET',
    permissions: DEV_PERMISSIONS,
    plan: 'DEVELOPER',
    ...input,
  })
  if (!response) throw new Error(`not handled: ${input.method ?? 'GET'} ${input.path}`)
  const status = response.status
  const text = await response.text()
  return { status, body: text === '' ? undefined : JSON.parse(text) }
}

async function createApp(api: ReturnType<typeof demo>, name = 'Notes app') {
  const created = await call(api, {
    method: 'POST',
    path: '/platform/v1/developer/apps',
    body: { name, redirectUris: ['https://notes.example.test/cb'] },
  })
  expect(created.status).toBe(201)
  return created.body
}

describe('demo developer apps', () => {
  it('creates an app, shows the client secret once, and never lists it again', async () => {
    const api = demo()
    const created = await createApp(api)
    expect(created.clientSecret).toMatch(/^cs_/)

    const list = await call(api, { path: '/platform/v1/developer/apps' })
    expect(list.status).toBe(200)
    expect(list.body).toHaveLength(2) // the seeded sample app and the new one
    for (const app of list.body) expect(app).not.toHaveProperty('clientSecret')
  })

  it('refuses a callback address that the platform would refuse', async () => {
    const api = demo()
    const bad = await call(api, {
      method: 'POST',
      path: '/platform/v1/developer/apps',
      body: { name: 'Plain', redirectUris: ['http://notes.example.test/cb'] },
    })
    expect(bad.status).toBe(400)
    expect(bad.body.detail).toMatch(/https/)
  })

  it('answers 403 with the missing permission to a member', async () => {
    const api = demo()
    const denied = await call(api, {
      path: '/platform/v1/developer/apps',
      permissions: MEMBER_PERMISSIONS,
    })
    expect(denied.status).toBe(403)
    expect(denied.body.detail).toBe("This route requires the permission 'apps:manage'.")
  })

  it('rotates a secret once, and revokes an app so its keys stop verifying', async () => {
    const api = demo()
    const app = await createApp(api)
    const rotated = await call(api, {
      method: 'POST',
      path: `/platform/v1/developer/apps/${app.id}/client-secret/rotate`,
    })
    expect(rotated.status).toBe(200)
    expect(rotated.body.clientSecret).toMatch(/^cs_/)
    expect(rotated.body.clientSecret).not.toBe(app.clientSecret)

    const deleted = await call(api, {
      method: 'DELETE',
      path: `/platform/v1/developer/apps/${app.id}`,
    })
    expect(deleted.status).toBe(204)
    const after = await call(api, { path: `/platform/v1/developer/apps/${app.id}` })
    expect(after.body.revokedAt).not.toBeNull()
  })
})

describe('demo API keys', () => {
  it('issues a key once, enforces the plan limit, and frees a slot on revoke', async () => {
    const api = demo()
    const app = await createApp(api)
    const issue = (name: string) =>
      call(api, {
        method: 'POST',
        path: `/platform/v1/developer/apps/${app.id}/keys`,
        body: { name, scopes: ['usage:read'] },
        plan: 'FREE',
      })

    const first = await issue('one')
    expect(first.status).toBe(201)
    expect(first.body.key).toMatch(/^pk_[0-9a-f]{8}_/)
    expect(first.body.keyPrefix).toBe(first.body.key.slice(0, 11))
    await issue('two')
    await issue('three')

    const fourth = await issue('four')
    expect(fourth.status).toBe(409)
    expect(fourth.body.detail).toBe('Your FREE plan allows 3 active API keys; revoke one first')

    const listed = await call(api, { path: `/platform/v1/developer/apps/${app.id}/keys` })
    expect(listed.body.every((key: { key?: string }) => key.key === undefined)).toBe(true)

    const revoked = await call(api, {
      method: 'DELETE',
      path: `/platform/v1/developer/keys/${first.body.id}`,
    })
    expect(revoked.status).toBe(204)
    expect((await issue('five')).status).toBe(201)
  })

  it('lets a key call usage:read and refuses everything else with the gateway message', async () => {
    const api = demo()
    const app = await createApp(api)
    const issued = await call(api, {
      method: 'POST',
      path: `/platform/v1/developer/apps/${app.id}/keys`,
      body: { name: 'usage', scopes: ['usage:read'] },
    })
    const bearer = issued.body.key

    const usage = await call(api, { path: '/platform/v1/usage/me', bearer })
    expect(usage.status).toBe(200)
    expect(usage.body).toEqual({ totalRequests: 7 })

    const outside = await call(api, { path: '/platform/v1/developer/apps', bearer })
    expect(outside.status).toBe(403)
    expect(outside.body.detail).toBe(
      'API keys cannot call this route. Only the routes listed for keys are open to them.',
    )

    const unknown = await call(api, { path: '/platform/v1/usage/me', bearer: 'pk_00000000_nope' })
    expect(unknown.status).toBe(401)

    await call(api, { method: 'DELETE', path: `/platform/v1/developer/keys/${issued.body.id}` })
    const afterRevoke = await call(api, { path: '/platform/v1/usage/me', bearer })
    expect(afterRevoke.status).toBe(401)
  })
})

describe('demo webhooks', () => {
  async function endpoint(api: ReturnType<typeof demo>, appId: string, url: string) {
    return call(api, {
      method: 'POST',
      path: `/platform/v1/developer/apps/${appId}/webhooks`,
      body: { url, description: 'test', eventTypes: ['reminder.created'] },
      plan: 'FREE',
    })
  }

  it('creates an endpoint with a signing secret shown once, with one sample delivery', async () => {
    const api = demo()
    const app = await createApp(api)
    const created = await endpoint(api, app.id, 'http://localhost:4000/hook')
    expect(created.status).toBe(201)
    expect(created.body.secret).toMatch(/^whsec_/)

    const log = await call(api, {
      path: `/platform/v1/developer/webhooks/${created.body.id}/deliveries`,
    })
    expect(log.body).toHaveLength(1)
    expect(log.body[0]).toMatchObject({ status: 'DELIVERED', eventType: 'reminder.created' })
  })

  it('refuses a plain http endpoint on a public host, and the second endpoint on FREE', async () => {
    const api = demo()
    const app = await createApp(api)
    expect((await endpoint(api, app.id, 'http://hooks.example.test/x')).status).toBe(400)

    const first = await endpoint(api, app.id, 'https://hooks.example.test/x')
    expect(first.status).toBe(201)
    const second = await endpoint(api, app.id, 'https://hooks.example.test/y')
    expect(second.status).toBe(409)
    expect(second.body.detail).toBe(
      'Your FREE plan allows 1 active webhook endpoints; disable one first',
    )
  })

  it('replays a delivery as a new delivery that points back at the original', async () => {
    const api = demo()
    const app = await createApp(api)
    const hook = await endpoint(api, app.id, 'https://hooks.example.test/x')
    const log = await call(api, {
      path: `/platform/v1/developer/webhooks/${hook.body.id}/deliveries`,
    })
    const original = log.body[0]

    const replay = await call(api, {
      method: 'POST',
      path: `/platform/v1/developer/webhooks/${hook.body.id}/deliveries/${original.id}/replay`,
    })
    expect(replay.status).toBe(202)
    expect(replay.body.replayOf).toBe(original.id)

    const after = await call(api, {
      path: `/platform/v1/developer/webhooks/${hook.body.id}/deliveries`,
    })
    expect(after.body).toHaveLength(2)
  })
})

describe('demo docs and consent', () => {
  it('lists the services and marks only the platform document as published', async () => {
    const index = await call(demo(), { path: '/platform/v1/docs', permissions: [] })
    expect(index.status).toBe(200)
    const platform = index.body.services.find((s: { name: string }) => s.name === 'platform')
    expect(platform.available).toBe(true)
    expect(index.body.services.filter((s: { available: boolean }) => s.available)).toHaveLength(1)
  })

  it('gives a member their connected apps and lets them revoke one', async () => {
    const api = demo()
    const grants = await call(api, {
      path: '/consent/v1/owner/grants',
      permissions: MEMBER_PERMISSIONS,
    })
    expect(grants.status).toBe(200)
    expect(grants.body.length).toBeGreaterThan(0)
    const grant = grants.body[0]

    const revoked = await call(api, {
      method: 'POST',
      path: `/consent/v1/owner/grants/${grant.id}/revoke`,
      permissions: MEMBER_PERMISSIONS,
    })
    expect(revoked.status).toBe(200)
    expect(revoked.body.status).toBe('REVOKED')

    const active = await call(api, {
      path: '/consent/v1/owner/grants',
      permissions: MEMBER_PERMISSIONS,
    })
    expect(active.body.find((g: { id: string }) => g.id === grant.id)).toBeUndefined()
  })

  it('returns nothing for a path it does not own', () => {
    expect(
      demo().handle({ method: 'GET', path: '/auth/v1/me', permissions: [], plan: 'FREE' }),
    ).toBeNull()
  })
})
