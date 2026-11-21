import { createApiClient } from '@platform/api-client'
import { DEMO_USER, createStubAuthClient } from '@platform/auth-web'
import { QueryClient } from '@tanstack/react-query'
import { render } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { App } from '../App'
import { createMockBackend, type SeedEntry } from '../mock/backend'
import { demoSeed } from '../mock/seed'
import type { Runtime } from '../runtime'

/** Fixed "now": noon UTC so the calendar date is the same in every realistic time zone. */
export const NOW = new Date('2026-11-19T12:00:00Z')

export interface RecordedRequest {
  method: string
  path: string
  search: string
  body: unknown
}

export interface HarnessOptions {
  route?: string
  seed?: readonly SeedEntry[]
  /** Wrap the mock fetch to inject failures. Return a Response to short-circuit, or undefined to pass through. */
  intercept?: (
    request: RecordedRequest,
    passThrough: () => Promise<Response>,
  ) => Response | undefined | Promise<Response | undefined>
}

export const problem = (status: number, title: string, detail: string, extra: object = {}) =>
  new Response(JSON.stringify({ type: 'about:blank', title, status, detail, ...extra }), {
    status,
    headers: { 'content-type': 'application/problem+json' },
  })

/** Renders the whole app against the in-memory mock API, with a stub signed-in user and a fixed clock. */
export function renderApp({ route = '/', seed = demoSeed(NOW), intercept }: HarnessOptions = {}) {
  const user = userEvent.setup()
  const requests: RecordedRequest[] = []
  const backend = createMockBackend({ clock: () => NOW, seed })
  const authClient = createStubAuthClient({ initialUser: DEMO_USER })

  const fetchWithLog: typeof fetch = async (input, init) => {
    const url = new URL(
      typeof input === 'string' ? input : input instanceof URL ? input.href : input.url,
      'http://localhost',
    )
    const recorded: RecordedRequest = {
      method: (init?.method ?? 'GET').toUpperCase(),
      path: url.pathname,
      search: url.search,
      body: typeof init?.body === 'string' ? (JSON.parse(init.body) as unknown) : undefined,
    }
    requests.push(recorded)
    const passThrough = () => backend.fetch(input, init)
    return (await intercept?.(recorded, passThrough)) ?? passThrough()
  }

  const runtime: Runtime = {
    demo: true,
    authClient,
    clock: () => NOW,
    apiClient: createApiClient({
      baseUrl: '/api',
      getToken: (force) => authClient.getIdToken(force),
      fetch: fetchWithLog,
      onUnauthorized: () => void authClient.signOut(),
    }),
    queryClient: new QueryClient({
      defaultOptions: { queries: { retry: false, staleTime: 0 }, mutations: { retry: false } },
    }),
  }

  const view = render(
    <MemoryRouter initialEntries={[route]}>
      <App runtime={runtime} />
    </MemoryRouter>,
  )
  return { user, requests, ...view }
}
