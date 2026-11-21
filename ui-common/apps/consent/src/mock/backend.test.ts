import { ApiError, createApiClient, type ApiClient } from '@platform/api-client'
import { beforeEach, describe, expect, it } from 'vitest'
import { paths } from '../shared/api/paths'
import type {
  AccessRequest,
  Attribute,
  ChainReport,
  Client,
  ClientWithSecret,
  Dashboard,
  Grant,
} from '../shared/api/types'
import { fieldErrors } from '../shared/lib/errors'
import { createMockBackend, type MockBackend } from './backend'
import { chainHash } from './chain'

let backend: MockBackend
let api: ApiClient

beforeEach(() => {
  backend = createMockBackend()
  api = createApiClient({ baseUrl: '/api', getToken: () => 'token', fetch: backend.fetch })
})

const failure = async (promise: Promise<unknown>): Promise<ApiError> => {
  try {
    await promise
  } catch (error) {
    if (error instanceof ApiError) return error
    throw error
  }
  throw new Error('expected the call to fail')
}

const pending = async () =>
  (await api.get<AccessRequest[]>(paths.requests, { query: { status: 'PENDING' } })).filter(
    (r) => r.status === 'PENDING',
  )

describe('request shapes (what the app sends)', () => {
  it('encodes key paths in the URL and sends JSON bodies', async () => {
    expect(paths.attribute('profile.sizes.shoe')).toBe(
      '/v1/owner/vault/attributes/profile.sizes.shoe',
    )
    expect(paths.attribute('a b/c')).toBe('/v1/owner/vault/attributes/a%20b%2Fc')
    await api.post(paths.attributes, { keyPath: 'a.b', value: [1], sensitivity: 'PUBLIC' })
    expect(backend.calls.at(-1)).toEqual({
      method: 'POST',
      path: '/v1/owner/vault/attributes',
      query: {},
      body: { keyPath: 'a.b', value: [1], sensitivity: 'PUBLIC' },
    })
  })

  it('sends list filters as query parameters and omits unset ones', async () => {
    await api.get(paths.accessLog, { query: { limit: 21, beforeSeq: undefined, clientId: 'cl_x' } })
    expect(backend.calls.at(-1)?.query).toEqual({ limit: '21', clientId: 'cl_x' })
    await api.get(paths.grants, { query: { includeInactive: true } })
    expect(backend.calls.at(-1)?.query).toEqual({ includeInactive: 'true' })
  })
})

describe('mock gateway contract: vault', () => {
  it('creates (201), reads, replaces and deletes (204)', async () => {
    const created = await api.post<Attribute>(paths.attributes, {
      keyPath: 'prefs.color',
      value: 'green',
      sensitivity: 'PUBLIC',
    })
    expect(created).toMatchObject({ keyPath: 'prefs.color', value: 'green', sensitivity: 'PUBLIC' })
    await api.put(paths.attribute('prefs.color'), { value: 'blue', sensitivity: 'PERSONAL' })
    expect((await api.get<Attribute>(paths.attribute('prefs.color'))).value).toBe('blue')
    await expect(api.delete(paths.attribute('prefs.color'))).resolves.toBeUndefined()
    expect((await failure(api.get(paths.attribute('prefs.color')))).status).toBe(404)
  })

  it('answers 409 ATTRIBUTE_EXISTS, 400 for bad paths and null, and VALIDATION_FAILED with field errors', async () => {
    const dup = await failure(
      api.post(paths.attributes, { keyPath: 'profile.name', value: 'x', sensitivity: 'PUBLIC' }),
    )
    expect(dup).toMatchObject({ status: 409, detail: 'Attribute already exists: profile.name' })
    expect(dup.extensions.code).toBe('ATTRIBUTE_EXISTS')

    const badPath = await failure(
      api.post(paths.attributes, { keyPath: 'Bad Path', value: 1, sensitivity: 'PUBLIC' }),
    )
    expect(badPath).toMatchObject({ status: 400 })
    expect(badPath.extensions.code).toBe('INVALID_REQUEST')

    const isNull = await failure(
      api.post(paths.attributes, { keyPath: 'a.b', value: null, sensitivity: 'PUBLIC' }),
    )
    expect(isNull.detail).toBe('value must be present and not null')

    const invalid = await failure(api.post(paths.attributes, { keyPath: ' ', sensitivity: null }))
    expect(invalid.extensions.code).toBe('VALIDATION_FAILED')
    expect(fieldErrors(invalid)).toEqual({
      keyPath: 'must not be blank',
      value: 'must not be null',
      sensitivity: 'must not be null',
    })

    const unknownLevel = await failure(
      api.post(paths.attributes, { keyPath: 'a.b', value: 1, sensitivity: 'TOP' }),
    )
    expect(unknownLevel).toMatchObject({ status: 400, detail: 'Failed to read request' })
  })

  it('lists sorted by key path', async () => {
    const keys = (await api.get<Attribute[]>(paths.attributes)).map((a) => a.keyPath)
    expect(keys).toEqual([...keys].sort())
  })
})

describe('mock gateway contract: approval', () => {
  it('approves exactly as requested with a SENSITIVE ceiling by default', async () => {
    const [request] = await pending()
    const grant = await api.post<Grant>(paths.approve(request?.id ?? ''))
    expect(grant).toMatchObject({
      scopes: request?.scopes,
      maxSensitivity: 'SENSITIVE',
      status: 'ACTIVE',
      readsUsed: 0,
    })
  })

  it('can only narrow: wider scopes, longer duration, more reads are 400', async () => {
    const stride = (await pending()).find((r) => r.clientName === 'Stride Shoes')
    const id = stride?.id ?? ''
    const wider = await failure(api.post(paths.approve(id), { scopes: ['profile:read'] }))
    expect(wider.detail).toContain('broader than what was requested')
    const longer = await failure(
      api.post(paths.approve(id), { durationSeconds: stride!.durationSeconds + 1 }),
    )
    expect(longer.detail).toContain('durationSeconds must be between 60 and the requested')
    const moreReads = await failure(api.post(paths.approve(id), { maxReads: 21 }))
    expect(moreReads.detail).toContain('maxReads must be at least 1')
    const tooShort = await failure(api.post(paths.approve(id), { durationSeconds: 59 }))
    expect(tooShort.extensions.code).toBe('VALIDATION_FAILED')
    expect(fieldErrors(tooShort)).toEqual({
      durationSeconds: 'must be greater than or equal to 60',
    })
  })

  it('narrows to a child scope and records a shorter expiry', async () => {
    const stride = (await pending()).find((r) => r.clientName === 'Stride Shoes')
    const grant = await api.post<Grant>(paths.approve(stride?.id ?? ''), {
      scopes: ['profile.sizes.shoe:read'],
      durationSeconds: 3600,
      maxReads: 2,
      maxSensitivity: 'PUBLIC',
    })
    expect(grant.scopes).toEqual(['profile.sizes.shoe:read'])
    expect(Date.parse(grant.expiresAt) - Date.parse(grant.createdAt)).toBe(3_600_000)
    expect(grant).toMatchObject({ maxReads: 2, maxSensitivity: 'PUBLIC' })
  })

  it('refuses to decide twice (409) and denies with a note', async () => {
    const [first, second] = await pending()
    await api.post(paths.approve(first?.id ?? ''))
    const again = await failure(api.post(paths.approve(first?.id ?? '')))
    expect(again).toMatchObject({ status: 409, detail: 'Request was already APPROVED' })
    expect(again.extensions.code).toBe('REQUEST_ALREADY_DECIDED')
    const denied = await api.post<AccessRequest>(paths.deny(second?.id ?? ''), { note: 'no' })
    expect(denied).toMatchObject({ status: 'DENIED', decisionNote: 'no' })
    expect((await failure(api.post(paths.deny(second?.id ?? '')))).status).toBe(409)
    expect((await failure(api.post(paths.approve('nope')))).status).toBe(404)
  })
})

describe('mock gateway contract: grants, clients, audit', () => {
  it('revokes idempotently and lists inactive grants only on request', async () => {
    const [grant] = await api.get<Grant[]>(paths.grants)
    const revoked = await api.post<Grant>(paths.revoke(grant?.id ?? ''))
    expect(revoked.status).toBe('REVOKED')
    const entriesBefore = (await api.get<unknown[]>(paths.accessLog, { query: { limit: 500 } }))
      .length
    await api.post(paths.revoke(grant?.id ?? ''))
    expect((await api.get<unknown[]>(paths.accessLog, { query: { limit: 500 } })).length).toBe(
      entriesBefore,
    )
    expect(await api.get<Grant[]>(paths.grants)).toHaveLength(0)
    expect(await api.get<Grant[]>(paths.grants, { query: { includeInactive: true } })).toHaveLength(
      1,
    )
  })

  it('registers a client with the secret once, rotates it, and disabling revokes its grants', async () => {
    const created = await api.post<ClientWithSecret>(paths.clients, {
      name: ' New App ',
      allowedScopes: ['profile.sizes:read', 'profile.sizes:read'],
    })
    expect(created.client).toMatchObject({
      name: 'New App',
      allowedScopes: ['profile.sizes:read'],
      disabledAt: null,
    })
    expect(created.clientSecret).toMatch(/^cs_/)
    expect(created.client.clientId).toMatch(/^cl_/)
    const listed = await api.get<Client[]>(paths.clients)
    expect(JSON.stringify(listed)).not.toContain(created.clientSecret)
    expect(JSON.stringify(await api.get(paths.client(created.client.clientId)))).not.toContain(
      created.clientSecret,
    )

    const rotated = await api.post<ClientWithSecret>(paths.rotateSecret(created.client.clientId))
    expect(rotated.clientSecret).not.toBe(created.clientSecret)
    expect(rotated.client.secretRotatedAt).not.toBeNull()

    const stride = listed.find((c) => c.name === 'Stride Shoes')
    await api.delete(paths.client(stride?.clientId ?? ''))
    await api.delete(paths.client(stride?.clientId ?? '')) // idempotent
    expect(await api.get<Grant[]>(paths.grants)).toHaveLength(0)
    const rotateDisabled = await failure(api.post(paths.rotateSecret(stride?.clientId ?? '')))
    expect(rotateDisabled).toMatchObject({ status: 409, detail: 'Client is disabled' })
    const approveDisabled = await failure(
      api.post(
        paths.approve((await pending()).find((r) => r.clientId === stride?.clientId)?.id ?? ''),
      ),
    )
    expect(approveDisabled.extensions.code).toBe('CLIENT_DISABLED')
  })

  it('validates registration with field errors', async () => {
    const error = await failure(
      api.post(paths.clients, { name: '', contactEmail: 'nope', allowedScopes: [] }),
    )
    expect(fieldErrors(error)).toEqual({
      name: 'must not be blank',
      contactEmail: 'must be a well-formed email address',
      allowedScopes: 'must not be empty',
    })
    const badScope = await failure(api.post(paths.clients, { name: 'x', allowedScopes: ['nope'] }))
    expect(badScope.extensions.code).toBe('INVALID_REQUEST')
  })

  it('serves the dashboard and pages the access log newest first with a client filter', async () => {
    const dashboard = await api.get<Dashboard>(paths.dashboard)
    expect(dashboard.pendingRequests).toBe(2)
    expect(dashboard.recentAccess).toHaveLength(10)
    const page = await api.get<{ seq: number }[]>(paths.accessLog, { query: { limit: 5 } })
    expect(page.map((e) => e.seq)).toEqual([21, 20, 19, 18, 17])
    const older = await api.get<{ seq: number }[]>(paths.accessLog, {
      query: { limit: 5, beforeSeq: 17 },
    })
    expect(older.map((e) => e.seq)).toEqual([16, 15, 14, 13, 12])
    const stride = (await api.get<Client[]>(paths.clients)).find((c) => c.name === 'Stride Shoes')
    const own = await api.get<{ clientId: string }[]>(paths.accessLog, {
      query: { clientId: stride?.clientId },
    })
    expect(own.length).toBeGreaterThan(0)
    expect(own.every((e) => e.clientId === stride?.clientId)).toBe(true)
  })

  it('requires a bearer token', async () => {
    const anonymous = createApiClient({
      baseUrl: '/api',
      getToken: () => null,
      fetch: backend.fetch,
    })
    expect((await failure(anonymous.get(paths.dashboard))).status).toBe(401)
  })
})

describe('audit chain', () => {
  const verify = () => api.get<ChainReport>(paths.verify)

  it('is intact after normal use, including every kind of write', async () => {
    await api.post(paths.attributes, { keyPath: 'x.y', value: 1, sensitivity: 'PUBLIC' })
    backend.simulateRead()
    const report = await verify()
    expect(report).toMatchObject({ valid: true, firstBrokenSeq: null, reason: null })
    expect(report.entriesChecked).toBe(report.headSeq)
    expect(report.headHash).toHaveLength(64)
  })

  it('reports an edited entry, a deleted entry and a cut tail at the first broken link', async () => {
    backend.tamperAudit('edit-entry', 3)
    expect(await verify()).toMatchObject({
      valid: false,
      reason: 'ENTRY_HASH_MISMATCH',
      firstBrokenSeq: 3,
      entriesChecked: 2,
    })

    backend = createMockBackend()
    api = createApiClient({ baseUrl: '/api', getToken: () => 't', fetch: backend.fetch })
    backend.tamperAudit('delete-entry', 5)
    expect(await verify()).toMatchObject({
      valid: false,
      reason: 'SEQUENCE_GAP',
      firstBrokenSeq: 5,
    })

    backend = createMockBackend()
    api = createApiClient({ baseUrl: '/api', getToken: () => 't', fetch: backend.fetch })
    backend.tamperAudit('truncate')
    expect(await verify()).toMatchObject({
      valid: false,
      reason: 'HEAD_MISMATCH',
      firstBrokenSeq: 21,
      entriesChecked: 20,
    })
  })

  it('hashes with length prefixes so field boundaries matter', () => {
    expect(chainHash(['ab', 'c'])).not.toBe(chainHash(['a', 'bc']))
    expect(chainHash([1, null])).toBe(chainHash([1, null]))
    expect(chainHash(['x'])).toHaveLength(64)
  })
})

describe('mock helpers', () => {
  it('injects failures, goes offline, and simulates app behaviour', async () => {
    backend.failNext(/GET \/v1\/owner\/dashboard/, 503, 'down', 2)
    expect((await failure(api.get(paths.dashboard))).status).toBe(503)
    expect((await failure(api.get(paths.dashboard))).status).toBe(503)
    expect((await api.get<Dashboard>(paths.dashboard)).pendingRequests).toBe(2)

    backend.setOffline(true)
    expect((await failure(api.get(paths.dashboard))).isNetworkError).toBe(true)
    backend.setOffline(false)

    const created = backend.simulateAccessRequest()
    expect(created.status).toBe('PENDING')
    expect((await pending()).some((r) => r.id === created.id)).toBe(true)
    expect(() => createMockBackend({ seed: 'empty' }).simulateAccessRequest()).toThrow(
      /register an active client/,
    )
    expect(() => createMockBackend({ seed: 'empty' }).simulateRead()).toThrow(/no grant/)
  })

  it('enforces read limits and sensitivity ceilings when an app reads', async () => {
    const stride = (await pending()).find((r) => r.clientName === 'Stride Shoes')
    const grant = await api.post<Grant>(paths.approve(stride?.id ?? ''), {
      scopes: ['profile.sizes:read', 'profile.name:read'],
      maxReads: 1,
      maxSensitivity: 'PUBLIC',
    })
    const first = backend.simulateRead(grant.id)
    expect(first.eventType).toBe('DATA_READ')
    expect(JSON.parse(first.detail)).toMatchObject({
      keys: ['profile.name'],
      withheldBySensitivity: 3,
    })
    expect(JSON.parse(backend.simulateRead(grant.id).detail)).toMatchObject({
      reason: 'MAX_READS_EXHAUSTED',
    })
    expect(JSON.parse(backend.simulateRead(grant.id, 'health').detail)).toMatchObject({
      reason: 'MAX_READS_EXHAUSTED',
    })
  })
})
