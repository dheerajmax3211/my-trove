import { ApiError } from '@platform/api-client'
import { describe, expect, it, vi } from 'vitest'
import { createApiClient } from '@platform/api-client'
import { describeError } from '../lib/errors'
import { LegacyCryptoError } from '../crypto'
import { ShamirError } from '../crypto/shamir'
import { createOwnerApi } from './ownerApi'
import { createTrusteeApi, createTrusteeClient } from './trusteeApi'
import { ownerPaths } from './paths'

function recorder(
  response: () => Response = () =>
    new Response('{}', { headers: { 'content-type': 'application/json' } }),
) {
  const calls: { url: string; method: string; headers: Headers; body: string | null }[] = []
  const fetchMock = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
    calls.push({
      url: typeof input === 'string' ? input : input instanceof URL ? input.href : input.url,
      method: init?.method ?? 'GET',
      headers: new Headers(init?.headers),
      body: typeof init?.body === 'string' ? init.body : null,
    })
    return Promise.resolve(response())
  })
  return { calls, fetch: fetchMock as unknown as typeof fetch }
}

describe('owner API request shapes', () => {
  const setup = () => {
    const rec = recorder()
    const client = createApiClient({ baseUrl: '/api', getToken: () => 'tok', fetch: rec.fetch })
    return { rec, api: createOwnerApi(client) }
  }

  it('sends a bearer token and the documented paths, methods and bodies', async () => {
    const { rec, api } = setup()
    const metadata = { v: 1, alg: 'AES-256-GCM', nonce: 'AAAAAAAAAAAAAAAA' }
    await api.getVault()
    await api.createVault({ ciphertext: 'Y3Q=', metadata })
    await api.updateVault({ ciphertext: 'Y3Q=', metadata, keyRotated: true })
    await api.pause(86400)
    await api.checkIn()
    await api.timeline(20)
    await api.invite('Ada')
    await api.revokeTrustee('t1')
    await api.uploadShare('t1', { sealedShare: { v: 1 }, vaultVersion: 2 })
    expect(rec.calls.map((c) => `${c.method} ${c.url}`)).toEqual([
      'GET /api/v1/legacy/vault',
      'POST /api/v1/legacy/vault',
      'PUT /api/v1/legacy/vault',
      'POST /api/v1/legacy/vault/pause',
      'POST /api/v1/legacy/vault/checkin',
      'GET /api/v1/legacy/vault/timeline?limit=20',
      'POST /api/v1/legacy/vault/trustees',
      'DELETE /api/v1/legacy/vault/trustees/t1',
      'PUT /api/v1/legacy/vault/trustees/t1/share',
    ])
    expect(rec.calls.every((c) => c.headers.get('authorization') === 'Bearer tok')).toBe(true)
    expect(JSON.parse(rec.calls[2]?.body ?? '{}')).toEqual({
      ciphertext: 'Y3Q=',
      metadata,
      keyRotated: true,
    })
    expect(JSON.parse(rec.calls[3]?.body ?? '{}')).toEqual({ durationSeconds: 86400 })
    expect(JSON.parse(rec.calls[6]?.body ?? '{}')).toEqual({ label: 'Ada' })
    expect(rec.calls[4]?.body).toBeNull()
    expect(ownerPaths.share('x')).toBe('/v1/legacy/vault/trustees/x/share')
  })
})

describe('trustee API client', () => {
  it('authenticates with the Trustee scheme only, never a bearer token', async () => {
    const rec = recorder()
    const api = createTrusteeApi(
      createTrusteeClient({ baseUrl: '/api', token: 'abc', fetch: rec.fetch }),
    )
    await api.me()
    await api.vote('APPROVE')
    await api.confirmShare('d1')
    await api.getShare()
    await api.getCiphertext()
    expect(rec.calls.map((c) => `${c.method} ${c.url}`)).toEqual([
      'GET /api/v1/legacy/trustee/me',
      'POST /api/v1/legacy/trustee/approval',
      'POST /api/v1/legacy/trustee/share/confirm',
      'GET /api/v1/legacy/trustee/share',
      'GET /api/v1/legacy/trustee/ciphertext',
    ])
    for (const c of rec.calls) expect(c.headers.get('authorization')).toBe('Trustee abc')
    expect(JSON.parse(rec.calls[1]?.body ?? '{}')).toEqual({ decision: 'APPROVE' })
    expect(JSON.parse(rec.calls[2]?.body ?? '{}')).toEqual({ shareDigest: 'd1' })
  })

  it('sends accept without credentials, and does not retry or refresh a 401', async () => {
    const rec = recorder(() => new Response('{}', { status: 401 }))
    const api = createTrusteeApi(
      createTrusteeClient({ baseUrl: '/api', token: null, fetch: rec.fetch }),
    )
    await expect(
      api.accept({ inviteToken: 'i', keyAlgorithm: 'X25519', publicKey: 'k', contacts: [] }),
    ).rejects.toBeInstanceOf(ApiError)
    expect(rec.calls).toHaveLength(1)
    expect(rec.calls[0]?.headers.get('authorization')).toBeNull()
  })
})

describe('error mapping', () => {
  const problem = (status: number, body: Record<string, unknown>) =>
    recorder(
      () =>
        new Response(JSON.stringify({ status, ...body }), {
          status,
          headers: { 'content-type': 'application/problem+json' },
        }),
    )

  it("turns problem+json into an ApiError with the server's detail and problems list", async () => {
    const rec = problem(400, {
      title: 'Invalid request',
      detail: 'a; b',
      problems: ['ciphertext is not valid Base64', 'metadata.alg must be AES-256-GCM'],
    })
    const api = createOwnerApi(
      createApiClient({ baseUrl: '/api', getToken: () => 't', fetch: rec.fetch }),
    )
    const error = await api
      .createVault({ ciphertext: 'x', metadata: { v: 1, alg: 'x', nonce: 'x' } })
      .catch((e: unknown) => e)
    expect(error).toBeInstanceOf(ApiError)
    expect((error as ApiError).status).toBe(400)
    expect(describeError(error)).toBe(
      'ciphertext is not valid Base64 metadata.alg must be AES-256-GCM',
    )
  })

  it("maps 409 to the server's sentence, 401 to a sign-in message and network failures to a retry hint", async () => {
    const conflict = new ApiError({
      status: 409,
      title: 'Not allowed in the current state',
      detail: 'Voting is not open',
    })
    expect(describeError(conflict)).toBe('Voting is not open')
    expect(describeError(new ApiError({ status: 401, title: 'Unauthorized' }))).toMatch(
      /not signed in/,
    )
    const offline = createApiClient({
      baseUrl: '/api',
      getToken: () => 't',
      fetch: () => Promise.reject(new TypeError('offline')),
    })
    const error = await createOwnerApi(offline)
      .getState()
      .catch((e: unknown) => e)
    expect(describeError(error)).toMatch(/could not be reached/)
  })

  it('maps crypto and Shamir failures to plain language', () => {
    expect(describeError(new LegacyCryptoError('wrong-key', 'x'))).toMatch(
      /does not open this data/,
    )
    expect(describeError(new LegacyCryptoError('wrong-passphrase', 'x'))).toMatch(
      /passphrase is wrong/,
    )
    expect(describeError(new LegacyCryptoError('key-mismatch', 'Specific message'))).toBe(
      'Specific message',
    )
    expect(describeError(new ShamirError('need 2 shares but only 1 supplied'))).toBe(
      'need 2 shares but only 1 supplied',
    )
    expect(describeError('weird')).toBe('Something went wrong.')
  })
})
