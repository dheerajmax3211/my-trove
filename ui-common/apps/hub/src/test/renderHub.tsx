import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { App } from '../App'
import type { SeedKind } from '../mock/seed'
import { createRuntime, type HubRuntime } from '../runtime/runtime'

/** A fixed "now" so due dates, relative times and expiry are the same on every run. */
export const NOW = Date.parse('2026-11-19T09:00:00Z')

export interface RecordedRequest {
  method: string
  path: string
  query: URLSearchParams
  /** Parsed JSON, a FormData, or undefined. */
  body: unknown
  /** Whether a bearer token was sent. */
  authorized: boolean
}

export interface RenderHubOptions {
  /** Demo user to start signed in as; `null` starts on the sign-in screen. Default Alice. */
  as?: string | null
  route?: string
  seed?: SeedKind
  env?: Record<string, string | undefined>
  /** Return a Response to replace the backend's answer (fault injection). */
  respond?: (request: RecordedRequest) => Response | undefined
}

export function renderHub(options: RenderHubOptions = {}) {
  const { as = 'demo-alice', route = '/', seed = 'empty', env = {}, respond } = options
  const requests: RecordedRequest[] = []

  const runtime: HubRuntime = createRuntime({
    env: { VITE_USE_MOCK: 'true', ...env },
    latencyMs: 0,
    now: () => NOW,
    seed,
    retryQueries: false,
    ...(as ? { initialUid: as } : {}),
    instrumentFetch: (inner) => async (input, init) => {
      const url = new URL(
        typeof input === 'string' ? input : input instanceof URL ? input.href : input.url,
        'http://localhost',
      )
      const raw = init?.body
      let body: unknown = raw ?? undefined
      if (typeof raw === 'string') {
        try {
          body = JSON.parse(raw)
        } catch {
          body = raw
        }
      }
      const recorded: RecordedRequest = {
        method: (init?.method ?? 'GET').toUpperCase(),
        path: url.pathname,
        query: url.searchParams,
        body,
        authorized: new Headers(init?.headers).has('authorization'),
      }
      requests.push(recorded)
      return respond?.(recorded) ?? inner(input, init)
    },
  })

  const user = userEvent.setup()
  render(
    <MemoryRouter initialEntries={[route]}>
      <App runtime={runtime} themeStorageKey={null} />
    </MemoryRouter>,
  )
  return { runtime, user, requests }
}

/** Requests made to a path, optionally narrowed by method. */
export const callsTo = (requests: RecordedRequest[], method: string, path: string | RegExp) =>
  requests.filter(
    (r) => r.method === method && (typeof path === 'string' ? r.path === path : path.test(r.path)),
  )

/** The page's single h1, once the signed-in shell has loaded. */
export const pageHeading = (name: string | RegExp) =>
  screen.findByRole('heading', { level: 1, name })

export const problem = (status: number, detail: string): Response =>
  new Response(JSON.stringify({ type: 'about:blank', title: 'Error', status, detail }), {
    status,
    headers: { 'content-type': 'application/problem+json' },
  })

/** A link in the sidebar navigation (page bodies may repeat the same label). */
export const navLink = async (name: string) =>
  within(await screen.findByRole('navigation', { name: 'Hub' })).getByRole('link', { name })
