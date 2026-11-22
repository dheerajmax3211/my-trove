import { describe, expect, it, vi } from 'vitest'
import {
  DEV_ACCOUNTS,
  DEV_IDP_LINK_EMAIL_KEY,
  DEV_IDP_STORAGE_KEY,
  createDevIdpAuthClient,
} from './devIdpClient'
import type { AuthUser } from './types'

function memoryStorage(initial: Record<string, string> = {}) {
  const data = new Map(Object.entries(initial))
  return {
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => void data.set(key, value),
    removeItem: (key: string) => void data.delete(key),
    data,
  }
}

const json = (body: unknown, status = 200) =>
  Promise.resolve(
    new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } }),
  )

/**
 * A fake of dev/dev-idp.mjs. `/token` mints for any address (scripts use it); `/link` issues a one-time code bound to the
 * address, and `/link/consume` spends it: once, only for that address, and only before it expires.
 */
function fakeIdp(now: () => number, ttlMs = 3_600_000) {
  let issued = 0
  const links = new Map<string, { email: string; expiresAt: number }>()
  const mint = (email: string) => {
    issued += 1
    const user: AuthUser = {
      uid: `dev-${email}`,
      email,
      displayName: email.split('@')[0] ?? null,
      photoURL: null,
      emailVerified: true,
    }
    return { token: `token-${issued}`, expiresAt: now() + ttlMs, user }
  }
  const fetchMock = vi.fn<typeof fetch>((input, init) => {
    const path = new URL(input instanceof Request ? input.url : input.toString()).pathname
    const body = JSON.parse(typeof init?.body === 'string' ? init.body : '{}') as Record<
      string,
      string
    >
    if (path === '/token') return json(mint(body.email ?? ''))
    if (path === '/link') {
      const code = `code-${links.size + 1}`
      links.set(code, { email: body.email ?? '', expiresAt: now() + 900_000 })
      return json({ code, email: body.email, expiresAt: now() + 900_000 })
    }
    if (path === '/link/consume') {
      const entry = links.get(body.code ?? '')
      if (!entry || entry.expiresAt < now()) {
        links.delete(body.code ?? '')
        return json(
          { error: 'This sign-in link has expired or was already used. Ask for a new one.' },
          410,
        )
      }
      if (entry.email !== body.email)
        return json({ error: 'This sign-in link was sent to a different address.' }, 403)
      links.delete(body.code ?? '')
      return json(mint(entry.email))
    }
    return json({ error: 'not found' }, 404)
  })
  return fetchMock
}

const states = (client: ReturnType<typeof createDevIdpAuthClient>) => {
  const seen: (AuthUser | null)[] = []
  const stop = client.onAuthStateChanged((u) => seen.push(u))
  return { seen, stop }
}

const linkUrl = (origin: string, code: string) => `${origin}/?mode=signIn&oobCode=${code}`

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

  it('never signs in with Google silently: it lists the five seeded accounts for a chooser instead', async () => {
    const fetchMock = fakeIdp(Date.now)
    const client = createDevIdpAuthClient({
      baseUrl: 'http://idp',
      fetch: fetchMock,
      storage: memoryStorage(),
    })
    const { seen } = states(client)
    await vi.waitFor(() => expect(seen).toHaveLength(1))

    await expect(client.signInWithGoogle()).rejects.toMatchObject({
      code: 'auth/dev-account-required',
    })
    expect(fetchMock).not.toHaveBeenCalled()
    expect(seen.at(-1)).toBeNull()

    expect(client.dev?.accounts.map((a) => a.persona)).toEqual([
      'OWNER',
      'ADMIN',
      'DEVELOPER',
      'MEMBER',
      'AUDITOR',
    ])
    expect(client.dev?.accounts).toEqual(DEV_ACCOUNTS)
  })

  it('signs in as the account chosen from the chooser and hands out its token', async () => {
    const fetchMock = fakeIdp(Date.now)
    const client = createDevIdpAuthClient({
      baseUrl: 'http://idp/',
      fetch: fetchMock,
      storage: memoryStorage(),
    })
    const { seen } = states(client)
    await vi.waitFor(() => expect(seen).toHaveLength(1))
    await client.dev?.signInAs('Admin@Example.test')
    expect(seen.at(-1)?.email).toBe('admin@example.test')
    expect(await client.getIdToken()).toBe('token-1')
    expect(fetchMock.mock.calls[0]?.[0]).toBe('http://idp/token')
  })

  it('an email link is issued but does not sign anyone in until it is opened', async () => {
    const fetchMock = fakeIdp(Date.now)
    const storage = memoryStorage()
    const client = createDevIdpAuthClient({ baseUrl: 'http://idp', fetch: fetchMock, storage })
    const { seen } = states(client)
    await vi.waitFor(() => expect(seen).toHaveLength(1))

    await client.sendEmailLink('ana@example.test', { url: 'http://localhost:5198' })
    expect(seen.at(-1)).toBeNull()
    expect(await client.getIdToken()).toBeNull()
    expect(storage.data.get(DEV_IDP_LINK_EMAIL_KEY)).toBe('ana@example.test')
    expect(client.dev?.lastEmailLink()).toBe(linkUrl('http://localhost:5198', 'code-1'))
    expect(client.isEmailLink(client.dev?.lastEmailLink() ?? '')).toBe(true)
    expect(client.isEmailLink('http://localhost:5198/')).toBe(false)
  })

  it('completes an opened link once, for the address it was issued to, and reuses the token until it nears expiry', async () => {
    let now = 1_000_000
    const fetchMock = fakeIdp(() => now, 120_000)
    const client = createDevIdpAuthClient({
      baseUrl: 'http://idp',
      fetch: fetchMock,
      storage: memoryStorage(),
      now: () => now,
    })
    await client.sendEmailLink('ana@example.test', { url: 'http://localhost:5198' })
    const link = client.dev?.lastEmailLink() ?? ''

    await client.completeEmailLinkSignIn(undefined, link)
    expect(await client.getIdToken()).toBe('token-1')
    expect(fetchMock).toHaveBeenCalledTimes(2) // /link and /link/consume; the token is then reused from cache
    now += 90_000 // inside the 60 s refresh margin
    expect(await client.getIdToken()).toBe('token-2')
    expect(await client.getIdToken(true)).toBe('token-3')
  })

  it('refuses a link opened with a different address, and a link that was already used', async () => {
    const client = createDevIdpAuthClient({
      baseUrl: 'http://idp',
      fetch: fakeIdp(Date.now),
      storage: memoryStorage(),
    })
    await client.sendEmailLink('ana@example.test', { url: 'http://localhost:5198' })
    const link = client.dev?.lastEmailLink() ?? ''

    await expect(client.completeEmailLinkSignIn('bo@example.test', link)).rejects.toMatchObject({
      code: 'auth/invalid-email',
    })
    expect(await client.getIdToken()).toBeNull()

    await client.completeEmailLinkSignIn('ana@example.test', link)
    await expect(client.completeEmailLinkSignIn('ana@example.test', link)).rejects.toMatchObject({
      code: 'auth/expired-action-code',
    })
  })

  it('asks for the address when the link is opened on a device that does not know it', async () => {
    const client = createDevIdpAuthClient({
      baseUrl: 'http://idp',
      fetch: fakeIdp(Date.now),
      storage: memoryStorage(),
    })
    await expect(
      client.completeEmailLinkSignIn(undefined, 'http://localhost:5198/?mode=signIn&oobCode=x'),
    ).rejects.toMatchObject({
      code: 'auth/email-required',
    })
    expect(client.isEmailLink('http://localhost:5198/?mode=signIn&oobCode=x')).toBe(true)
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
    await expect(client.dev?.signInAs('member@example.test')).rejects.toMatchObject({
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
