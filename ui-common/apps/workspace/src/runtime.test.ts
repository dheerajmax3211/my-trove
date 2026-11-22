import { afterEach, describe, expect, it, vi } from 'vitest'
import { fakeModule, memoryStorages } from './testing/harness'
import { DEFAULT_API_BASE, DEFAULT_SITE_URL, DEMO_FLAG_KEY, createRuntime } from './runtime'

afterEach(() => vi.unstubAllGlobals())

describe('createRuntime mode', () => {
  it('is never demo unless asked: with no identity provider configured it is live and refuses to sign in', async () => {
    const runtime = createRuntime({}, { search: '', storage: memoryStorages() })
    expect(runtime.mode).toBe('live')
    expect(runtime.demo).toBeNull()
    expect(runtime.apiBase).toBe(DEFAULT_API_BASE)
    expect(runtime.siteUrl).toBe(DEFAULT_SITE_URL)
    await expect(runtime.authClient.signInWithGoogle()).rejects.toMatchObject({
      code: 'auth/not-configured',
    })
  })

  it('is demo only when the visitor asks for it with ?demo=1', () => {
    const runtime = createRuntime({}, { search: '?demo=1', storage: memoryStorages() })
    expect(runtime.mode).toBe('demo')
    expect(runtime.demo?.explicit).toBe(true)
  })

  it('a plain visit to the front door (/) forgets a stale demo flag and shows the real sign-in', () => {
    const storage = memoryStorages()
    const env = { VITE_DEV_IDP_URL: 'http://idp.test' }
    createRuntime(env, { search: '?demo=1', storage })
    const frontDoor = createRuntime(env, { search: '', pathname: '/', storage })
    expect(frontDoor.mode).toBe('live')
    expect(storage.session?.getItem(DEMO_FLAG_KEY)).toBeNull()
  })

  it('?demo=0 forgets a demo flag left in the tab, so a configured identity provider is live again', () => {
    const storage = memoryStorages()
    const env = { VITE_DEV_IDP_URL: 'http://idp.test' }
    createRuntime(env, { search: '?demo=1', storage })
    expect(createRuntime(env, { search: '', pathname: '/app/waiting-on', storage }).mode).toBe(
      'demo',
    )
    const escaped = createRuntime(env, { search: '?demo=0', storage })
    expect(escaped.mode).toBe('live')
    expect(storage.session?.getItem(DEMO_FLAG_KEY)).toBeNull()
  })

  it('leaveDemo forgets the flag so the next load is live', () => {
    const storage = memoryStorages()
    const env = { VITE_DEV_IDP_URL: 'http://idp.test' }
    const demo = createRuntime(env, { search: '?demo=1', storage })
    demo.leaveDemo()
    expect(createRuntime(env, { search: '', storage }).mode).toBe('live')
  })

  it('is demo with ?demo=1 even when an identity provider is configured, and remembers it for the tab', () => {
    const storage = memoryStorages()
    const env = { VITE_DEV_IDP_URL: 'http://idp.test' }
    const first = createRuntime(env, { search: '?demo=1', storage })
    expect(first.mode).toBe('demo')
    expect(first.demo?.explicit).toBe(true)
    expect(storage.session?.getItem(DEMO_FLAG_KEY)).toBe('1')
    // an in-app page load without the parameter, in the same tab, is still demo
    expect(createRuntime(env, { search: '', pathname: '/app/waiting-on', storage }).mode).toBe(
      'demo',
    )
    // a new tab (fresh session storage) is live
    const fresh = createRuntime(env, {
      search: '',
      storage: memoryStorages(),
      authClient: first.authClient,
    })
    expect(fresh.mode).toBe('live')
    expect(fresh.demo).toBeNull()
  })

  it('is live when the dev identity provider is configured, with the base URLs from env', () => {
    const runtime = createRuntime(
      {
        VITE_DEV_IDP_URL: 'http://idp.test',
        VITE_API_BASE_URL: 'https://gw.example/api/',
        VITE_SITE_URL: 'https://site.example/',
      },
      { search: '', storage: memoryStorages() },
    )
    expect(runtime.mode).toBe('live')
    expect(runtime.apiBase).toBe('https://gw.example/api')
    expect(runtime.siteUrl).toBe('https://site.example')
  })

  it('leaveDemo forgets the flag', () => {
    const storage = memoryStorages()
    const runtime = createRuntime({}, { search: '?demo=1', storage })
    runtime.leaveDemo()
    expect(storage.session?.getItem(DEMO_FLAG_KEY)).toBeNull()
  })
})

describe('demo transports', () => {
  it('answers /me for the chosen persona and notifies subscribers', async () => {
    const runtime = createRuntime({}, { search: '?demo=1', storage: memoryStorages() })
    const listener = vi.fn()
    runtime.demo?.subscribe(listener)
    runtime.demo?.setPersona('AUDITOR')
    expect(listener).toHaveBeenCalledTimes(1)
    const response = await runtime.workspaceFetch?.('http://x/api/auth/v1/me')
    const me = (await response?.json()) as { roles: string[]; permissions: string[] }
    expect(me.roles).toEqual(['AUDITOR'])
    expect(me.permissions).toContain('audit:read')
    expect(me.permissions).not.toContain('products:use')
  })

  it('gives a module without a demo API a 404 problem body, never the network', async () => {
    const network = vi.fn()
    vi.stubGlobal('fetch', network)
    const runtime = createRuntime({}, { search: '?demo=1', storage: memoryStorages() })
    const response = await runtime.moduleFetch(fakeModule('plain'))?.('http://x/api/plain/v1/items')
    expect(response?.status).toBe(404)
    expect(response?.headers.get('content-type')).toContain('problem+json')
    expect(network).not.toHaveBeenCalled()
  })

  it('uses the module demo API when it has one, one instance per module', async () => {
    const runtime = createRuntime({}, { search: '?demo=1', storage: memoryStorages() })
    const mod = fakeModule('rich', { demoName: 'from demo' })
    const a = runtime.moduleFetch(mod)
    expect(a).toBe(runtime.moduleFetch(mod))
    const body = (await (await a?.('http://x/api/rich/v1/items'))?.json()) as { name: string }
    expect(body.name).toBe('from demo')
  })
})
