/**
 * In-memory stand-in for auth-service (:8081) and shared-service (:8082). It speaks their real
 * contract (paths, status codes, error shapes, validation rules) so demo mode and the tests meet the
 * same successes and failures the live backend produces. Callers are identified by a `demo-token:<uid>`
 * bearer token, which the demo auth client issues.
 */
import { createAuditRoutes } from './audit'
import { createAuthRoutes } from './auth'
import { createFileRoutes, downloadFile } from './files'
import { createHouseholdRoutes } from './households'
import { errorResponse, HttpError } from './http'
import { createReminderRoutes } from './reminders'
import type { MockEnv, Route } from './route'
import { createSeededState, type SeedKind } from './seed'

export const DEMO_TOKEN_PREFIX = 'demo-token:'

export interface MockBackendOptions {
  /** Epoch milliseconds source. Default: the real clock. */
  now?: () => number
  /** Artificial network delay per request. Default 0. */
  latencyMs?: number
  /** `demo`: a lived-in household and reminders. `empty`: only the demo users. Default `demo`. */
  seed?: SeedKind
}

export interface MockBackend {
  fetch: typeof fetch
  /** The backend's clock, which `advanceClock` moves forward. */
  now: () => number
  /** Moves the clock forward and fires any reminders that became due. */
  advanceClock: (ms: number) => void
}

const SERVICE_PATH = /\/(auth|shared)(\/v1\/.*)$/

export function createMockBackend(options: MockBackendOptions = {}): MockBackend {
  const { latencyMs = 0, seed = 'demo' } = options
  const realNow = options.now ?? (() => Date.now())
  let offset = 0
  const now = () => realNow() + offset

  const env: MockEnv = { state: createSeededState(seed, now()), now }
  const reminders = createReminderRoutes(env)
  const routes: Record<'auth' | 'shared', Route[]> = {
    auth: createAuthRoutes(env),
    shared: [
      ...createHouseholdRoutes(env),
      ...reminders.routes,
      ...createFileRoutes(env),
      ...createAuditRoutes(env),
    ],
  }

  const mockFetch = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const url = new URL(
      typeof input === 'string' ? input : input instanceof URL ? input.href : input.url,
      'http://localhost',
    )
    const method = (init?.method ?? 'GET').toUpperCase()
    const matched = SERVICE_PATH.exec(url.pathname)
    if (latencyMs > 0) await new Promise((resolve) => setTimeout(resolve, latencyMs))
    reminders.fireDue()

    try {
      if (!matched) throw new HttpError(404, `${method} ${url.pathname} does not exist.`)
      const service = matched[1] as 'auth' | 'shared'
      const path = matched[2] ?? ''

      if (service === 'shared' && method === 'GET' && path === '/v1/files/download')
        return downloadFile(env, url.searchParams.get('token'))

      const token = new Headers(init?.headers).get('authorization')?.replace(/^Bearer /, '')
      const uid = token?.startsWith(DEMO_TOKEN_PREFIX)
        ? token.slice(DEMO_TOKEN_PREFIX.length)
        : null
      if (!uid) throw new HttpError(401, 'Unauthorized', 'empty')

      for (const route of routes[service]) {
        if (route.method !== method) continue
        const hit = route.pattern.exec(path)
        if (!hit) continue
        return await route.handle({
          uid,
          params: hit.slice(1).map(decodeURIComponent),
          query: url.searchParams,
          body: init?.body,
        })
      }
      throw new HttpError(404, `${method} ${path} does not exist.`)
    } catch (error) {
      if (error instanceof HttpError) return errorResponse(error, url.pathname)
      throw error
    }
  }

  return {
    fetch: mockFetch,
    now,
    advanceClock: (ms) => {
      offset += ms
      reminders.fireDue()
    },
  }
}
