import { describe, expect, it, vi } from 'vitest'
import { DEV_IDP_DEFAULT_EMAIL, DEV_IDP_STORAGE_KEY, createDevIdpAuthClient } from './devIdpClient'
import type { AuthUser } from './types'

function memoryStorage(initial: Record<string, string> = {}) {
  const data = new Map(Object.entries(initial))
  return {
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => void data.set(key, value),
    removeItem: (key: string) => void data.delete(key),
  }
}

function fakeIdp(now: () => number, ttlMs = 3_600_000) {
  let issued = 0
  const fetchMock = vi.fn<typeof fetch>((_input, init) => {
    const raw = typeof init?.body === 'string' ? init.body : '{}'
    const { email } = JSON.parse(raw) as { email: string }
    issued += 1
    const user: AuthUser = {
      uid: `dev-${email}`,
      email,
      displayName: email.split('@')[0] ?? null,
      photoURL: null,
      emailVerified: true,
    }
    return Promise.resolve(
      new Response(JSON.stringify({ token: `token-${issued}`, expiresAt: now() + ttlMs, user }), {
        status: 200,
      }),
    )
  })
  return fetchMock
}

const states = (client: ReturnType<typeof createDevIdpAuthClient>) => {
  const seen: (AuthUser | null)[] = []
  const stop = client.onAuthStateChanged((u) => seen.push(u))
  return { seen, stop }
}

describe('createDevIdpAuthClient', () => {
  it('starts signed out and has no token', async () => {
    const client = createDevIdpAuthClient({
      baseUrl: 'http://idp',
      fetch: fakeIdp(Date.now),
      storage: memoryStorage(),
    })
    const { seen } = states(client)
    await vi.waitFor(() => expect(seen).toEqual([null]))
    expect(await client.getIdToken()).toBeNull()
  })

  it('signs in with Google as the default dev account and hands out its token', async () => {
    const fetchMock = fakeIdp(Date.now)
    const client = createDevIdpAuthClient({
      baseUrl: 'http://idp/',
      fetch: fetchMock,
      storage: memoryStorage(),
    })
    const { seen } = states(client)
    await vi.waitFor(() => expect(seen).toHaveLength(1))
    await client.signInWithGoogle()
    expect(seen.at(-1)?.email).toBe(DEV_IDP_DEFAULT_EMAIL)
    expect(await client.getIdToken()).toBe('token-1')
    expect(fetchMock.mock.calls[0]?.[0]).toBe('http://idp/token')
  })

  it('signs in as the typed email for an email link and reuses the token until it nears expiry', async () => {
    let now = 1_000_000
    const fetchMock = fakeIdp(() => now, 120_000)
    const client = createDevIdpAuthClient({
      baseUrl: 'http://idp',
      fetch: fetchMock,
      storage: memoryStorage(),
      now: () => now,
    })
    await client.sendEmailLink('ana@example.test')
    expect(await client.getIdToken()).toBe('token-1')
    expect(fetchMock).toHaveBeenCalledTimes(1)
    now += 90_000 // inside the 60 s refresh margin
    expect(await client.getIdToken()).toBe('token-2')
    expect(await client.getIdToken(true)).toBe('token-3')
  })

  it('requires an email to complete an email-link sign-in', async () => {
    const client = createDevIdpAuthClient({
      baseUrl: 'http://idp',
      fetch: fakeIdp(Date.now),
      storage: memoryStorage(),
    })
    await expect(client.completeEmailLinkSignIn()).rejects.toMatchObject({
      code: 'auth/email-required',
    })
    expect(client.isEmailLink()).toBe(false)
  })

  it('restores a remembered session on load and forgets it on sign-out', async () => {
    const storage = memoryStorage({ [DEV_IDP_STORAGE_KEY]: 'ana@example.test' })
    const client = createDevIdpAuthClient({
      baseUrl: 'http://idp',
      fetch: fakeIdp(Date.now),
      storage,
    })
    const { seen } = states(client)
    await vi.waitFor(() => expect(seen.at(-1)?.email).toBe('ana@example.test'))
    await client.signOut()
    expect(seen.at(-1)).toBeNull()
    expect(storage.getItem(DEV_IDP_STORAGE_KEY)).toBeNull()
    expect(await client.getIdToken()).toBeNull()
  })

  it('explains how to start the identity provider when it is unreachable', async () => {
    const down = vi.fn<typeof fetch>(() => Promise.reject(new TypeError('fetch failed')))
    const client = createDevIdpAuthClient({
      baseUrl: 'http://idp',
      fetch: down,
      storage: memoryStorage(),
    })
    await expect(client.signInWithGoogle()).rejects.toMatchObject({
      code: 'auth/network-request-failed',
      message: expect.stringContaining('dev/up.sh'),
    })
  })

  it('stays signed out when a remembered session cannot be restored', async () => {
    const down = vi.fn<typeof fetch>(() => Promise.reject(new TypeError('fetch failed')))
    const client = createDevIdpAuthClient({
      baseUrl: 'http://idp',
      fetch: down,
      storage: memoryStorage({ [DEV_IDP_STORAGE_KEY]: 'ana@example.test' }),
    })
    const { seen } = states(client)
    await vi.waitFor(() => expect(seen).toEqual([null]))
  })
})
