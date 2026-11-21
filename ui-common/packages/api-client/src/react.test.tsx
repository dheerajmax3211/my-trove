import { QueryClient } from '@tanstack/react-query'
import { act, renderHook, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { createApiClient } from './client'
import { ApiError } from './errors'
import {
  ApiProvider,
  apiQueryKey,
  createApiQueryClient,
  useApiClient,
  useApiMutation,
  useApiQuery,
} from './react'

const ok = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })

function setup(handler: (url: string, init: RequestInit) => Response | Promise<Response>) {
  const fetchMock = vi.fn((url: string, init: RequestInit) => Promise.resolve(handler(url, init)))
  const client = createApiClient({
    baseUrl: 'https://api.test',
    getToken: () => 'tok',
    fetch: fetchMock as unknown as typeof fetch,
  })
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  const wrapper = ({ children }: { children: ReactNode }) => (
    <ApiProvider client={client} queryClient={queryClient}>
      {children}
    </ApiProvider>
  )
  return { fetchMock, client, queryClient, wrapper }
}

describe('useApiQuery', () => {
  it('fetches through the client with the bearer token and caches by path + query', async () => {
    const { wrapper, fetchMock, queryClient } = setup(() => ok([{ id: 1 }]))
    const { result } = renderHook(
      () => useApiQuery<{ id: number }[]>('/items', { query: { status: 'open' } }),
      { wrapper },
    )
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(result.current.data).toEqual([{ id: 1 }])
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(url).toBe('https://api.test/items?status=open')
    expect(new Headers(init.headers).get('authorization')).toBe('Bearer tok')
    expect(queryClient.getQueryData(apiQueryKey('/items', { status: 'open' }))).toEqual([{ id: 1 }])
  })

  it('surfaces failures as a typed ApiError', async () => {
    const { wrapper } = setup(
      () =>
        new Response(JSON.stringify({ type: 'urn:x', title: 'Gone', status: 410 }), {
          status: 410,
          headers: { 'content-type': 'application/problem+json' },
        }),
    )
    const { result } = renderHook(() => useApiQuery('/old'), { wrapper })
    await waitFor(() => expect(result.current.isError).toBe(true))
    expect(result.current.error).toBeInstanceOf(ApiError)
    expect(result.current.error?.status).toBe(410)
    expect(result.current.error?.title).toBe('Gone')
  })

  it('supports select and enabled options', async () => {
    const { wrapper, fetchMock } = setup(() => ok({ items: [1, 2, 3] }))
    const { result } = renderHook(
      () => useApiQuery<{ items: number[] }, number>('/count', { select: (d) => d.items.length }),
      { wrapper },
    )
    await waitFor(() => expect(result.current.data).toBe(3))
    const disabled = renderHook(() => useApiQuery('/never', { enabled: false }), { wrapper })
    expect(disabled.result.current.fetchStatus).toBe('idle')
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })
})

describe('useApiMutation', () => {
  it('sends the variables as JSON and invalidates listed query keys', async () => {
    let items = [{ id: 1 }]
    const { wrapper, fetchMock } = setup((_url, init) => {
      if (init.method === 'POST') {
        items = [...items, { id: 2 }]
        return ok({ id: 2 }, 201)
      }
      return ok(items)
    })
    const { result } = renderHook(
      () => ({
        list: useApiQuery<{ id: number }[]>('/items'),
        create: useApiMutation<{ id: number }, { name: string }>({
          path: '/items',
          invalidate: [apiQueryKey('/items')],
        }),
      }),
      { wrapper },
    )
    await waitFor(() => expect(result.current.list.data).toHaveLength(1))
    await act(async () => {
      await result.current.create.mutateAsync({ name: 'new' })
    })
    const post = fetchMock.mock.calls.find(([, init]) => init.method === 'POST') as [
      string,
      RequestInit,
    ]
    expect(post[1].body).toBe('{"name":"new"}')
    await waitFor(() => expect(result.current.list.data).toHaveLength(2))
  })

  it('supports dynamic paths, DELETE and typed errors', async () => {
    const { wrapper, fetchMock } = setup(
      () =>
        new Response(JSON.stringify({ title: 'Conflict', status: 409 }), {
          status: 409,
          headers: { 'content-type': 'application/problem+json' },
        }),
    )
    const { result } = renderHook(
      () =>
        useApiMutation<void, { id: string }>({ method: 'DELETE', path: (v) => `/items/${v.id}` }),
      { wrapper },
    )
    await act(async () => {
      await result.current.mutateAsync({ id: '42' }).catch(() => {})
    })
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(url).toBe('https://api.test/items/42')
    expect(init.method).toBe('DELETE')
    expect(init.body).toBeUndefined()
    await waitFor(() => expect(result.current.error).toBeInstanceOf(ApiError))
  })
})

describe('provider + defaults', () => {
  it('useApiClient throws without a provider', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    expect(() => renderHook(() => useApiClient())).toThrow(/ApiProvider/)
    spy.mockRestore()
  })

  it('creates its own QueryClient when none is supplied', async () => {
    const client = createApiClient({
      baseUrl: '/a',
      getToken: () => null,
      fetch: () => Promise.resolve(ok({ hi: 1 })),
    })
    const { result } = renderHook(() => useApiQuery<{ hi: number }>('/x'), {
      wrapper: ({ children }) => <ApiProvider client={client}>{children}</ApiProvider>,
    })
    await waitFor(() => expect(result.current.data).toEqual({ hi: 1 }))
  })

  it('default retry policy: never retries 4xx, retries network/5xx up to twice', () => {
    const retry = createApiQueryClient().getDefaultOptions().queries?.retry as (
      n: number,
      e: unknown,
    ) => boolean
    expect(retry(0, new ApiError({ status: 404 }))).toBe(false)
    expect(retry(0, new ApiError({ status: 503 }))).toBe(true)
    expect(retry(1, new ApiError({ status: 0 }))).toBe(true)
    expect(retry(2, new ApiError({ status: 503 }))).toBe(false)
  })
})
