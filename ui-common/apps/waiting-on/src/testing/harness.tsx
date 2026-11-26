import { createApiClient } from '@platform/api-client'
import { ApiProvider } from '@platform/api-client'
import { AuthProvider, DEMO_USER, RequireAuth, createStubAuthClient } from '@platform/auth-web'
import { ThemeProvider, ToastProvider } from '@platform/ui'
import { ModuleBaseProvider } from '@platform/workspace-kit'
import { QueryClient } from '@tanstack/react-query'
import { render } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Fragment } from 'react'
import { MemoryRouter } from 'react-router-dom'
import { ClockProvider } from '../lib/clock'
import { createMockBackend, type SeedEntry } from '../mock/backend'
import { demoSeed } from '../mock/seed'
import { productModule } from '../module'

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

/** Renders the module against the in-memory mock API, with a stub signed-in user and a fixed clock. */
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

  const apiClient = createApiClient({
    baseUrl: '/api',
    getToken: (force) => authClient.getIdToken(force),
    fetch: fetchWithLog,
    onUnauthorized: () => void authClient.signOut(),
  })
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: 0 }, mutations: { retry: false } },
  })
  const { Providers = Fragment, Routes: ModuleRoutes } = productModule

  // The module as the workspace mounts it (at the root here): signed in, with the workspace's providers
  // around the module's own, and a fixed clock inside them.
  const view = render(
    <MemoryRouter initialEntries={[route]}>
      <ThemeProvider storageKey={null}>
        <AuthProvider client={authClient}>
          <ApiProvider client={apiClient} queryClient={queryClient}>
            <ToastProvider>
              <RequireAuth loading={null} fallback={<p>Signed out</p>}>
                <ModuleBaseProvider base="">
                  <Providers>
                    <ClockProvider clock={() => NOW}>
                      <main>
                        <ModuleRoutes />
                      </main>
                    </ClockProvider>
                  </Providers>
                </ModuleBaseProvider>
              </RequireAuth>
            </ToastProvider>
          </ApiProvider>
        </AuthProvider>
      </ThemeProvider>
    </MemoryRouter>,
  )
  return { user, requests, ...view }
}
