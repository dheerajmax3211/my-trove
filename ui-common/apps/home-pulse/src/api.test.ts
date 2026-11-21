import { ApiError, createApiClient } from '@platform/api-client'
import { describe, expect, it } from 'vitest'
import { alertQuery, alertsApi } from './features/alerts/api'
import { appliancesApi } from './features/appliances/api'
import { devicesApi } from './features/devices/api'
import { readingsApi } from './features/readings/api'
import { remindersApi } from './features/reminders/api'
import { fieldErrorsFrom } from './lib/errors'

interface Recorded {
  url: URL
  method: string
  headers: Headers
  body: unknown
}

function harness(
  respond: () => Response = () =>
    new Response('{}', { headers: { 'content-type': 'application/json' } }),
) {
  const calls: Recorded[] = []
  const fetchStub: typeof fetch = (input, init) => {
    const raw = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url
    calls.push({
      url: new URL(raw, 'http://app.test'),
      method: init?.method ?? 'GET',
      headers: new Headers(init?.headers),
      body: typeof init?.body === 'string' ? (JSON.parse(init.body) as unknown) : undefined,
    })
    return Promise.resolve(respond())
  }
  const client = createApiClient({
    baseUrl: '/api',
    getToken: () => 'id-token-1',
    fetch: fetchStub,
  })
  return { client, calls }
}

const ID = '00000000-0000-4000-8000-000000000001'

describe('appliances API', () => {
  it('lists, reads, creates, updates and deletes with the right verbs, paths and bearer token', async () => {
    const { client, calls } = harness()
    const api = appliancesApi(client)
    const input = {
      name: 'Fridge',
      type: 'FRIDGE' as const,
      location: null,
      warrantyEndDate: '2027-01-01',
    }
    await api.list()
    await api.get(ID)
    await api.create(input)
    await api.update(ID, input)
    await api.remove(ID)
    expect(calls.map((c) => `${c.method} ${c.url.pathname}`)).toEqual([
      'GET /api/v1/appliances',
      `GET /api/v1/appliances/${ID}`,
      'POST /api/v1/appliances',
      `PUT /api/v1/appliances/${ID}`,
      `DELETE /api/v1/appliances/${ID}`,
    ])
    for (const c of calls) expect(c.headers.get('authorization')).toBe('Bearer id-token-1')
    expect(calls[2]?.body).toEqual(input)
    expect(calls[2]?.headers.get('content-type')).toBe('application/json')
    expect(calls[4]?.body).toBeUndefined()
  })

  it('reads health and restarts learning without a body', async () => {
    const { client, calls } = harness()
    const api = appliancesApi(client)
    await api.health(ID)
    await api.relearnBaseline(ID)
    expect(calls[0]?.url.pathname).toBe(`/api/v1/appliances/${ID}/health`)
    expect(`${calls[1]?.method} ${calls[1]?.url.pathname}`).toBe(
      `POST /api/v1/appliances/${ID}/baseline/relearn`,
    )
    expect(calls[1]?.body).toBeUndefined()
  })
})

describe('devices API', () => {
  it('registers with just a label, lists per appliance and revokes by device id', async () => {
    const { client, calls } = harness()
    const api = devicesApi(client)
    await api.register(ID, 'Smart plug')
    await api.list(ID)
    await api.revoke('dev-1')
    expect(calls.map((c) => `${c.method} ${c.url.pathname}`)).toEqual([
      `POST /api/v1/appliances/${ID}/devices`,
      `GET /api/v1/appliances/${ID}/devices`,
      'DELETE /api/v1/devices/dev-1',
    ])
    expect(calls[0]?.body).toEqual({ label: 'Smart plug' })
  })
})

describe('readings API', () => {
  it('sends the window as ISO instants and leaves the resolution to the service unless asked', async () => {
    const { client, calls } = harness()
    const api = readingsApi(client)
    const from = new Date('2026-11-18T12:00:00Z')
    const to = new Date('2026-11-19T12:00:00Z')
    await api.series(ID, { from, to })
    await api.series(ID, { from, to, resolution: 'ONE_MINUTE' })
    expect(calls[0]?.url.searchParams.get('from')).toBe('2026-11-18T12:00:00.000Z')
    expect(calls[0]?.url.searchParams.get('to')).toBe('2026-11-19T12:00:00.000Z')
    expect(calls[0]?.url.searchParams.has('resolution')).toBe(false)
    expect(calls[1]?.url.searchParams.get('resolution')).toBe('ONE_MINUTE')
  })
})

describe('alerts API', () => {
  it.each([
    ['ACTIVE', { limit: 100 }],
    ['OPEN', { status: 'OPEN', limit: 100 }],
    ['ACKNOWLEDGED', { status: 'ACKNOWLEDGED', limit: 100 }],
    ['RESOLVED', { status: 'RESOLVED', limit: 100 }],
    ['ALL', { includeResolved: true, limit: 100 }],
  ] as const)('translates the %s filter into service parameters', (filter, expected) => {
    expect(alertQuery(filter)).toEqual(expected)
  })

  it('adds the appliance filter and acknowledges with a bodyless POST', async () => {
    const { client, calls } = harness()
    const api = alertsApi(client)
    await api.list('OPEN', ID)
    await api.acknowledge('alert-1')
    expect(Object.fromEntries(calls[0]?.url.searchParams ?? [])).toEqual({
      status: 'OPEN',
      applianceId: ID,
      limit: '100',
    })
    expect(`${calls[1]?.method} ${calls[1]?.url.pathname}`).toBe('POST /api/v1/alerts/alert-1/ack')
    expect(calls[1]?.body).toBeUndefined()
  })
})

describe('reminders API', () => {
  it('asks for a horizon in days', async () => {
    const { client, calls } = harness()
    await remindersApi(client).list(60)
    expect(calls[0]?.url.search).toBe('?days=60')
  })
})

describe('error mapping', () => {
  const problem = (status: number, detail: string) => () =>
    new Response(JSON.stringify({ type: 'about:blank', title: 'Bad Request', status, detail }), {
      status,
      headers: { 'content-type': 'application/problem+json' },
    })

  it('turns a Spring validation problem into an ApiError that the form can map onto fields', async () => {
    const { client } = harness(problem(400, 'name must not be blank; type must not be null'))
    const error = await appliancesApi(client)
      .create({ name: '', type: 'FRIDGE' })
      .catch((e: unknown) => e)
    expect(error).toBeInstanceOf(ApiError)
    expect((error as ApiError).status).toBe(400)
    expect(fieldErrorsFrom(error, ['name', 'type'])).toEqual({
      name: 'Must not be blank',
      type: 'Must not be null',
    })
  })

  it('exposes a 409 conflict from registering a second device', async () => {
    const { client } = harness(
      problem(409, 'Appliance already has an active device; revoke it first to rotate the token'),
    )
    const error = (await devicesApi(client)
      .register(ID, 'x')
      .catch((e: unknown) => e)) as ApiError
    expect(error.status).toBe(409)
    expect(error.detail).toMatch(/revoke it first/)
  })

  it('reports an unreachable server as a network error', async () => {
    const client = createApiClient({
      baseUrl: '/api',
      getToken: () => 't',
      fetch: () => Promise.reject(new TypeError('Failed to fetch')),
    })
    const error = (await appliancesApi(client)
      .list()
      .catch((e: unknown) => e)) as ApiError
    expect(error.isNetworkError).toBe(true)
  })
})
