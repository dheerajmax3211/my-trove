import { describe, expect, it, vi } from 'vitest'
import { createStubAuthClient, DEMO_USER } from '@platform/auth-web'
import { fakeModule, json, memoryStorages, urlOf } from '../testing/harness'
import { createRuntime } from '../runtime'
import { createRuntimeStore } from './runtimeStore'

function setup(fetchImpl?: typeof fetch) {
  const authClient = createStubAuthClient({ initialUser: DEMO_USER })
  const runtime = createRuntime(
    { VITE_DEV_IDP_URL: 'http://idp.test', VITE_API_BASE_URL: 'http://gw.test/api/' },
    {
      search: '',
      storage: memoryStorages(),
      authClient,
      ...(fetchImpl ? { fetch: fetchImpl } : {}),
    },
  )
  return { authClient, runtime, store: createRuntimeStore(runtime, authClient) }
}

describe('createRuntimeStore', () => {
  it('gives every module its own client, cache and gateway URL', () => {
    const { store } = setup()
    const a = store.forModule(fakeModule('alpha'))
    const b = store.forModule(fakeModule('beta', { service: 'shared' }))
    expect(a.client).not.toBe(b.client)
    expect(a.queryClient).not.toBe(b.queryClient)
    expect(a.queryClient).not.toBe(store.workspace.queryClient)
    expect(a.baseUrl).toBe('http://gw.test/api/alpha')
    expect(b.baseUrl).toBe('http://gw.test/api/shared')
    expect(store.workspace.baseUrl).toBe('http://gw.test/api')
    // asking again returns the same pair
    expect(store.forModule(fakeModule('alpha'))).toBe(a)
  })

  it('sends each module request to its own service with the user token', async () => {
    const fetchMock = vi.fn<typeof fetch>(() => Promise.resolve(json({ ok: true })))
    const { store } = setup(fetchMock)
    await store.forModule(fakeModule('alpha')).client.get('/v1/items')
    await store.forModule(fakeModule('beta')).client.get('/v1/items')
    const urls = fetchMock.mock.calls.map(([url]) => urlOf(url))
    expect(urls).toEqual(['http://gw.test/api/alpha/v1/items', 'http://gw.test/api/beta/v1/items'])
    const auth = new Headers(fetchMock.mock.calls[0]?.[1]?.headers).get('authorization')
    expect(auth).toBe('Bearer stub-token-1')
  })

  it('empties every cache and forgets the clients on clear', () => {
    const { store } = setup()
    const alpha = fakeModule('alpha')
    const before = store.forModule(alpha)
    before.queryClient.setQueryData(['/v1/items'], { name: 'private' })
    store.workspace.queryClient.setQueryData(['/auth/v1/me'], { id: 'x' })

    store.clear()

    expect(before.queryClient.getQueryData(['/v1/items'])).toBeUndefined()
    expect(store.workspace.queryClient.getQueryData(['/auth/v1/me'])).toBeUndefined()
    expect(store.forModule(alpha)).not.toBe(before)
  })

  it('signs the user out when a module request is still 401 after the refresh', async () => {
    const fetchMock = vi.fn<typeof fetch>(() =>
      Promise.resolve(
        new Response('{}', { status: 401, headers: { 'content-type': 'application/json' } }),
      ),
    )
    const { store, authClient } = setup(fetchMock)
    const signOut = vi.spyOn(authClient, 'signOut')
    await expect(store.forModule(fakeModule('alpha')).client.get('/v1/items')).rejects.toBeTruthy()
    expect(signOut).toHaveBeenCalled()
  })
})
