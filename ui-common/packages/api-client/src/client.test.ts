import { describe, expect, it, vi } from 'vitest'
import { buildUrl, createApiClient } from './client'
import { ApiError, isApiError } from './errors'

const json = (body: unknown, init: ResponseInit & { type?: string } = {}) =>
  new Response(JSON.stringify(body), {
    status: 200,
    ...init,
    headers: { 'content-type': init.type ?? 'application/json', ...init.headers },
  })

const problem = (status: number, body: Record<string, unknown> = {}) =>
  json(
    { type: 'https://errors.example/test', title: 'Test problem', status, ...body },
    { status, type: 'application/problem+json' },
  )

function setup(
  responses: (Response | Error | DOMException)[],
  getToken = vi.fn<(force: boolean) => string | null>((force) =>
    force ? 'fresh-token' : 'token-1',
  ),
) {
  const queue = [...responses]
  const fetchMock = vi.fn((_input: string, _init: RequestInit) => {
    const next = queue.shift()
    if (!next) throw new Error('unexpected extra fetch call')
    return next instanceof Response ? Promise.resolve(next) : Promise.reject(next)
  })
  const onUnauthorized = vi.fn()
  const client = createApiClient({
    baseUrl: 'https://api.test/v1/',
    getToken,
    fetch: fetchMock as unknown as typeof fetch,
    onUnauthorized,
  })
  const call = (n: number) => fetchMock.mock.calls[n] as [string, RequestInit]
  const authHeader = (n: number) => new Headers(call(n)[1].headers).get('authorization')
  return { client, fetchMock, getToken, onUnauthorized, call, authHeader }
}

describe('buildUrl', () => {
  it('joins base and path without double slashes and appends query params', () => {
    expect(
      buildUrl('https://api.test/v1/', '/items', {
        a: 1,
        b: ['x', 'y'],
        c: null,
        d: undefined,
        e: false,
      }),
    ).toBe('https://api.test/v1/items?a=1&b=x&b=y&e=false')
  })
  it('keeps absolute URLs and merges into an existing query string', () => {
    expect(buildUrl('/api', 'https://other.test/x?y=1', { z: 2 })).toBe(
      'https://other.test/x?y=1&z=2',
    )
    expect(buildUrl('/api', 'items')).toBe('/api/items')
  })
})

describe('createApiClient: auth header', () => {
  it('attaches the Firebase ID token as a Bearer token', async () => {
    const { client, authHeader, getToken } = setup([json({ ok: true })])
    await expect(client.get('/me')).resolves.toEqual({ ok: true })
    expect(authHeader(0)).toBe('Bearer token-1')
    expect(getToken).toHaveBeenCalledWith(false)
  })

  it('sends no Authorization header when signed out (token null)', async () => {
    const { client, authHeader } = setup(
      [json({})],
      vi.fn<(force: boolean) => string | null>(() => null),
    )
    await client.get('/public-ish')
    expect(authHeader(0)).toBeNull()
  })

  it('skips the token entirely for auth:false requests', async () => {
    const { client, authHeader, getToken } = setup([json({})])
    await client.get('/health', { auth: false })
    expect(authHeader(0)).toBeNull()
    expect(getToken).not.toHaveBeenCalled()
  })
})

describe('createApiClient: 401 refresh + single retry', () => {
  it('forces a token refresh on 401 and retries once with the new token', async () => {
    const { client, fetchMock, getToken, authHeader, onUnauthorized } = setup([
      problem(401),
      json({ id: 7 }),
    ])
    await expect(client.get('/items/7')).resolves.toEqual({ id: 7 })
    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(getToken.mock.calls).toEqual([[false], [true]])
    expect(authHeader(0)).toBe('Bearer token-1')
    expect(authHeader(1)).toBe('Bearer fresh-token')
    expect(onUnauthorized).not.toHaveBeenCalled()
  })

  it('does not retry more than once: a second 401 becomes an ApiError and fires onUnauthorized', async () => {
    const { client, fetchMock, onUnauthorized } = setup([problem(401), problem(401)])
    const error = await client.get('/items').catch((e: unknown) => e)
    expect(error).toBeInstanceOf(ApiError)
    expect((error as ApiError).status).toBe(401)
    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(onUnauthorized).toHaveBeenCalledTimes(1)
  })

  it('replays the JSON body on the retry', async () => {
    const { client, call } = setup([problem(401), json({ ok: true })])
    await client.post('/items', { name: 'a' })
    expect(call(0)[1].body).toBe('{"name":"a"}')
    expect(call(1)[1].body).toBe('{"name":"a"}')
  })

  it('does not retry when the refresh yields no token (signed out) and reports the 401', async () => {
    const getToken = vi.fn<(force: boolean) => string | null>((force) => (force ? null : 'stale'))
    const { client, fetchMock, onUnauthorized } = setup([problem(401)], getToken)
    await expect(client.get('/x')).rejects.toMatchObject({ status: 401 })
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(onUnauthorized).toHaveBeenCalled()
  })

  it('does not refresh or retry for non-401 failures or auth:false requests', async () => {
    const a = setup([problem(403)])
    await expect(a.client.get('/x')).rejects.toMatchObject({ status: 403 })
    expect(a.getToken).toHaveBeenCalledTimes(1)
    const b = setup([problem(401)])
    await expect(b.client.get('/x', { auth: false })).rejects.toMatchObject({ status: 401 })
    expect(b.fetchMock).toHaveBeenCalledTimes(1)
  })
})

describe('createApiClient: error normalisation (RFC 7807)', () => {
  it('maps application/problem+json to ApiError with extensions', async () => {
    const { client } = setup([
      problem(422, {
        detail: 'Email is invalid',
        instance: '/requests/9',
        errors: { email: ['must contain @'] },
      }),
    ])
    const error = (await client.post('/requests', {}).catch((e: unknown) => e)) as ApiError
    expect(isApiError(error)).toBe(true)
    expect(error).toMatchObject({
      name: 'ApiError',
      status: 422,
      type: 'https://errors.example/test',
      title: 'Test problem',
      detail: 'Email is invalid',
      instance: '/requests/9',
      message: 'Email is invalid',
    })
    expect(error.extensions).toEqual({ errors: { email: ['must contain @'] } })
    expect(error.isClientError).toBe(true)
    expect(error.toProblem()).toMatchObject({ status: 422, errors: { email: ['must contain @'] } })
  })

  it('handles plain JSON error bodies (message / detail)', async () => {
    const { client } = setup([
      json({ message: 'nope' }, { status: 400, statusText: 'Bad Request' }),
    ])
    await expect(client.get('/x')).rejects.toMatchObject({
      status: 400,
      type: 'about:blank',
      title: 'Bad Request',
      detail: 'nope',
    })
  })

  it('handles text and empty bodies without throwing parse errors', async () => {
    const text = setup([
      new Response('upstream exploded', { status: 502, headers: { 'content-type': 'text/plain' } }),
    ])
    await expect(text.client.get('/x')).rejects.toMatchObject({
      status: 502,
      detail: 'upstream exploded',
      isServerError: true,
    })
    const empty = setup([new Response(null, { status: 500 })])
    await expect(empty.client.get('/x')).rejects.toMatchObject({
      status: 500,
      title: 'HTTP 500',
      detail: undefined,
    })
  })

  it('does not leak HTML error pages into detail', async () => {
    const { client } = setup([
      new Response('<html>oops</html>', { status: 503, headers: { 'content-type': 'text/html' } }),
    ])
    await expect(client.get('/x')).rejects.toMatchObject({ status: 503, detail: undefined })
  })

  it('wraps network failures as ApiError status 0', async () => {
    const { client } = setup([new TypeError('Failed to fetch')])
    const error = (await client.get('/x').catch((e: unknown) => e)) as ApiError
    expect(error).toBeInstanceOf(ApiError)
    expect(error).toMatchObject({ status: 0, isNetworkError: true, title: 'Network error' })
    expect(error.cause).toBeInstanceOf(TypeError)
  })

  it('lets aborts through untouched so callers/React Query can tell them apart', async () => {
    const abort = new DOMException('aborted', 'AbortError')
    const { client } = setup([abort])
    await expect(client.get('/x')).rejects.toBe(abort)
  })

  it('reports invalid JSON in a success response as an ApiError', async () => {
    const { client } = setup([
      new Response('{nope', { status: 200, headers: { 'content-type': 'application/json' } }),
    ])
    await expect(client.get('/x')).rejects.toMatchObject({
      name: 'ApiError',
      title: 'Invalid JSON in response body',
    })
  })
})

describe('createApiClient: requests and responses', () => {
  it('serialises plain bodies as JSON and sets content-type', async () => {
    const { client, call } = setup([json({ id: 1 })])
    await client.post('/items', { name: 'x' })
    const [url, init] = call(0)
    expect(url).toBe('https://api.test/v1/items')
    expect(init.method).toBe('POST')
    expect(new Headers(init.headers).get('content-type')).toBe('application/json')
    expect(init.body).toBe('{"name":"x"}')
  })

  it('passes FormData through untouched (browser sets the boundary)', async () => {
    const { client, call } = setup([json({})])
    const form = new FormData()
    form.append('f', 'v')
    await client.post('/upload', form)
    expect(call(0)[1].body).toBe(form)
    expect(new Headers(call(0)[1].headers).has('content-type')).toBe(false)
  })

  it('returns undefined for 204 and plain text for non-JSON success', async () => {
    const a = setup([new Response(null, { status: 204 })])
    await expect(a.client.delete('/items/1')).resolves.toBeUndefined()
    const b = setup([
      new Response('pong', { status: 200, headers: { 'content-type': 'text/plain' } }),
    ])
    await expect(b.client.get('/ping')).resolves.toBe('pong')
  })

  it('applies default and per-request headers and forwards the abort signal', async () => {
    const fetchMock = vi.fn(() => Promise.resolve(json({})))
    const client = createApiClient({
      baseUrl: '/api',
      getToken: () => 't',
      fetch: fetchMock,
      headers: { 'X-App': 'gallery' },
    })
    const controller = new AbortController()
    await client.get('/x', {
      headers: { 'X-Req': '1' },
      signal: controller.signal,
      query: { q: 'a b' },
    })
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toBe('/api/x?q=a+b')
    const headers = new Headers(init.headers)
    expect(headers.get('x-app')).toBe('gallery')
    expect(headers.get('x-req')).toBe('1')
    expect(init.signal).toBe(controller.signal)
  })

  it('exposes put and patch helpers', async () => {
    const { client, call } = setup([json({}), json({})])
    await client.put('/a', { v: 1 })
    await client.patch('/a', { v: 2 })
    expect(call(0)[1].method).toBe('PUT')
    expect(call(1)[1].method).toBe('PATCH')
  })
})
