import { ApiProvider, createApiClient } from '@platform/api-client'
import { WorkspaceSessionProvider, createSession } from '@platform/workspace-kit'
import { QueryClient } from '@tanstack/react-query'
import { render, screen, waitFor } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { jsonResponse } from '../testing/harness'
import { PlatformApiProvider, siblingClient, useNames, usePlatformQuery } from './api'
import { formatPercent } from './format'

const id = (n: number) => `0190d2a4-7a3e-7c1b-9f2e-${String(n).padStart(12, '0')}`

function wrap(fetchImpl: typeof fetch, permissions = ['users:read'], extra?: React.ReactNode) {
  const client = createApiClient({
    baseUrl: 'http://gw.test/api/auth',
    getToken: () => 'tok',
    fetch: fetchImpl,
  })
  return (children: React.ReactNode) => (
    <WorkspaceSessionProvider
      value={createSession({
        uid: 'u',
        email: null,
        displayName: null,
        roles: [],
        permissions,
        plan: 'FREE',
        isDemo: false,
      })}
    >
      <ApiProvider
        client={client}
        queryClient={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
      >
        {extra}
        {children}
      </ApiProvider>
    </WorkspaceSessionProvider>
  )
}

describe('siblingClient', () => {
  it('reaches the platform service through the auth client: the ../platform path resolves to /api/platform', async () => {
    const urls: string[] = []
    const auth = createApiClient({
      baseUrl: 'http://gw.test/api/auth',
      getToken: () => 'tok',
      fetch: (input) => {
        urls.push(String(input))
        return Promise.resolve(jsonResponse({ ok: true }))
      },
    })
    await siblingClient(auth, 'platform').get('/v1/usage/summary', { query: { a: 1 } })
    expect(urls[0]).toBe('http://gw.test/api/auth/../platform/v1/usage/summary?a=1')
    // what the browser (and Node's fetch) actually request after URL parsing
    expect(new URL(urls[0] ?? '').pathname).toBe('/api/platform/v1/usage/summary')
  })

  it('works with a relative gateway base too, and sends the same token', async () => {
    const seen: { url: string; auth: string | null }[] = []
    const auth = createApiClient({
      baseUrl: '/api/auth',
      getToken: () => 'tok',
      fetch: (input, init) => {
        seen.push({ url: String(input), auth: new Headers(init?.headers).get('authorization') })
        return Promise.resolve(jsonResponse([]))
      },
    })
    await siblingClient(auth, 'platform').get('/v1/flags')
    expect(new URL(seen[0]?.url ?? '', 'http://x').pathname).toBe('/api/platform/v1/flags')
    expect(seen[0]?.auth).toBe('Bearer tok')
  })

  it('an explicit PlatformApiProvider client wins over the derived one', async () => {
    const calls: string[] = []
    const explicit = createApiClient({
      baseUrl: 'http://platform.test/api/platform',
      getToken: () => 'x',
      fetch: (input) => {
        calls.push(String(input))
        return Promise.resolve(jsonResponse({ n: 1 }))
      },
    })
    function Probe() {
      const q = usePlatformQuery<{ n: number }>('/v1/thing')
      return <p>{q.data ? `n=${q.data.n}` : 'loading'}</p>
    }
    const authFetch = () => Promise.reject(new Error('the auth client must not be used'))
    render(
      wrap(authFetch as unknown as typeof fetch)(
        <PlatformApiProvider client={explicit}>
          <Probe />
        </PlatformApiProvider>,
      ),
    )
    await screen.findByText('n=1')
    expect(calls).toEqual(['http://platform.test/api/platform/v1/thing'])
  })
})

describe('useNames', () => {
  function Names({ ids }: { ids: string[] }) {
    const names = useNames(ids)
    return (
      <ul>
        {ids.map((i) => (
          <li key={i}>{names.nameOf(i)}</li>
        ))}
      </ul>
    )
  }

  it('batches at most 100 ids per call, dedupes, and skips things that are not ids', async () => {
    const batches: string[][] = []
    const fetchImpl = ((input: RequestInfo | URL) => {
      const url = new URL(String(input))
      const ids = (url.searchParams.get('ids') ?? '').split(',')
      batches.push(ids)
      return Promise.resolve(
        jsonResponse(ids.map((i) => ({ id: i, email: `${i.slice(-3)}@x.test`, displayName: null }))),
      )
    }) as typeof fetch
    const ids = Array.from({ length: 250 }, (_, n) => id(n + 1))
    render(wrap(fetchImpl)(<Names ids={[...ids, ...ids.slice(0, 10), 'not-an-id']} />))
    await waitFor(() => expect(batches).toHaveLength(3))
    expect(batches.map((b) => b.length).sort((a, b) => a - b)).toEqual([50, 100, 100])
    expect(batches.flat()).toHaveLength(250)
    expect(new Set(batches.flat()).size).toBe(250)
    expect((await screen.findAllByText('001@x.test')).length).toBeGreaterThan(0)
  })

  it('shows the email when there is no display name, and flags ids the server does not know', async () => {
    const fetchImpl = (() =>
      Promise.resolve(
        jsonResponse([{ id: id(1), email: 'ada@x.test', displayName: null }]),
      )) as unknown as typeof fetch
    render(wrap(fetchImpl)(<Names ids={[id(1), id(2)]} />))
    await screen.findByText('ada@x.test')
    expect(screen.getByText('Unknown user (0190d2a4)')).toBeInTheDocument()
  })

  it('does not call the lookup without users:read', () => {
    let called = false
    const fetchImpl = (() => {
      called = true
      return Promise.resolve(jsonResponse([]))
    }) as unknown as typeof fetch
    render(wrap(fetchImpl, [])(<Names ids={[id(1)]} />))
    expect(called).toBe(false)
  })
})

describe('formatPercent', () => {
  it('never rounds a real error rate to nothing', () => {
    expect(formatPercent(0)).toBe('0%')
    expect(formatPercent(0.00001)).toBe('<0.01%')
    expect(formatPercent(0.0123)).toBe('1.23%')
    expect(formatPercent(0.25)).toBe('25%')
  })
})
