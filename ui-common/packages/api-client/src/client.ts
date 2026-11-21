import { ApiError, errorFromResponse } from './errors'

export type QueryValue = string | number | boolean | null | undefined
export type QueryParams = Record<string, QueryValue | readonly QueryValue[]>

export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE'

export interface RequestOptions {
  method?: HttpMethod
  query?: QueryParams
  /** Plain objects/arrays are sent as JSON. FormData, Blob, strings etc. are sent as-is. */
  body?: unknown
  headers?: HeadersInit
  signal?: AbortSignal | null
  /** Set `false` for public endpoints: no token is fetched or attached. Default true. */
  auth?: boolean
}

export interface ApiClientOptions {
  /** e.g. `https://api.example.com` or `/api`. */
  baseUrl: string
  /**
   * Supplies the Firebase ID token. Called with `forceRefresh=true` only after a 401, to get a
   * brand new token. Return `null` when signed out. With @platform/auth-web: `(force) => getIdToken(force)`.
   */
  getToken: (forceRefresh: boolean) => Promise<string | null> | string | null
  /** Custom fetch (tests, SSR, instrumentation). Default: global fetch. */
  fetch?: typeof fetch
  /** Headers added to every request. */
  headers?: HeadersInit
  /** Called when a request is still 401 after the refresh-and-retry (session is really gone). */
  onUnauthorized?: (error: ApiError) => void
}

export interface ApiClient {
  request: <T = unknown>(path: string, options?: RequestOptions) => Promise<T>
  get: <T = unknown>(path: string, options?: Omit<RequestOptions, 'method' | 'body'>) => Promise<T>
  post: <T = unknown>(
    path: string,
    body?: unknown,
    options?: Omit<RequestOptions, 'method' | 'body'>,
  ) => Promise<T>
  put: <T = unknown>(
    path: string,
    body?: unknown,
    options?: Omit<RequestOptions, 'method' | 'body'>,
  ) => Promise<T>
  patch: <T = unknown>(
    path: string,
    body?: unknown,
    options?: Omit<RequestOptions, 'method' | 'body'>,
  ) => Promise<T>
  delete: <T = unknown>(
    path: string,
    options?: Omit<RequestOptions, 'method' | 'body'>,
  ) => Promise<T>
}

const ABSOLUTE = /^[a-z][a-z\d+.-]*:\/\//i

export function buildUrl(baseUrl: string, path: string, query?: QueryParams): string {
  const joined = ABSOLUTE.test(path)
    ? path
    : `${baseUrl.replace(/\/+$/, '')}/${path.replace(/^\/+/, '')}`
  if (!query) return joined
  const params = new URLSearchParams()
  for (const [key, value] of Object.entries(query)) {
    const values = Array.isArray(value) ? (value as readonly QueryValue[]) : [value as QueryValue]
    for (const v of values) if (v !== null && v !== undefined) params.append(key, String(v))
  }
  const qs = params.toString()
  if (!qs) return joined
  return `${joined}${joined.includes('?') ? '&' : '?'}${qs}`
}

const isRawBody = (body: unknown): body is BodyInit =>
  typeof body === 'string' ||
  body instanceof FormData ||
  body instanceof Blob ||
  body instanceof URLSearchParams ||
  body instanceof ArrayBuffer ||
  ArrayBuffer.isView(body)

async function parseSuccess<T>(response: Response): Promise<T> {
  if (response.status === 204 || response.status === 205) return undefined as T
  const text = await response.text()
  if (text === '') return undefined as T
  if (/json/i.test(response.headers.get('content-type') ?? '')) {
    try {
      return JSON.parse(text) as T
    } catch (cause) {
      throw new ApiError({ status: response.status, title: 'Invalid JSON in response body', cause })
    }
  }
  return text as T
}

/**
 * Small typed fetch wrapper:
 *  - attaches `Authorization: Bearer <Firebase ID token>`
 *  - on 401, forces ONE token refresh and retries the request once
 *  - converts every failure to an `ApiError` (RFC 7807 problem+json aware)
 */
export function createApiClient(options: ApiClientOptions): ApiClient {
  const doFetch = (input: string, init: RequestInit) =>
    (options.fetch ?? globalThis.fetch)(input, init)

  async function request<T>(path: string, req: RequestOptions = {}): Promise<T> {
    const { method = 'GET', query, body, headers, signal, auth = true } = req
    const url = buildUrl(options.baseUrl, path, query)

    const send = async (token: string | null): Promise<Response> => {
      const h = new Headers(options.headers)
      new Headers(headers).forEach((value, key) => h.set(key, value))
      if (!h.has('Accept')) h.set('Accept', 'application/json, application/problem+json')
      let payload: BodyInit | undefined
      if (body !== undefined) {
        if (isRawBody(body)) payload = body
        else {
          payload = JSON.stringify(body)
          if (!h.has('Content-Type')) h.set('Content-Type', 'application/json')
        }
      }
      if (auth && token) h.set('Authorization', `Bearer ${token}`)
      try {
        return await doFetch(url, {
          method,
          headers: h,
          ...(payload !== undefined ? { body: payload } : {}),
          ...(signal ? { signal } : {}),
        })
      } catch (cause) {
        if (cause instanceof DOMException && cause.name === 'AbortError') throw cause
        throw new ApiError({
          status: 0,
          type: 'urn:platform:network-error',
          title: 'Network error',
          detail: 'The request could not reach the server.',
          cause,
        })
      }
    }

    let response = await send(auth ? await options.getToken(false) : null)

    if (response.status === 401 && auth) {
      const fresh = await options.getToken(true)
      if (fresh) {
        await response.body?.cancel().catch(() => {})
        response = await send(fresh) // exactly one retry: no loops
      }
    }

    if (!response.ok) {
      const error = await errorFromResponse(response)
      if (error.status === 401) options.onUnauthorized?.(error)
      throw error
    }
    return parseSuccess<T>(response)
  }

  type Rest = Omit<RequestOptions, 'method' | 'body'>
  return {
    request,
    get: (path, o) => request(path, { ...o, method: 'GET' }),
    post: (path, body, o) => request(path, { ...o, method: 'POST', body }),
    put: (path, body, o) => request(path, { ...o, method: 'PUT', body }),
    patch: (path, body, o) => request(path, { ...o, method: 'PATCH', body }),
    delete: (path, o?: Rest) => request(path, { ...o, method: 'DELETE' }),
  }
}
