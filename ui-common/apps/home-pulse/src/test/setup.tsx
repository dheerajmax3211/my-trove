import { createApiClient } from '@platform/api-client'
import { ApiProvider, type ApiClient } from '@platform/api-client'
import { AuthProvider, DEMO_USER, RequireAuth, createStubAuthClient } from '@platform/auth-web'
import { ThemeProvider, ToastProvider } from '@platform/ui'
import { ModuleBaseProvider, ModuleNavLink } from '@platform/workspace-kit'
import { QueryClient } from '@tanstack/react-query'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Fragment } from 'react'
import { MemoryRouter } from 'react-router-dom'
import { ClockProvider } from '../lib/clock'
import { createMockApi, type MockApi, type MockApiOptions } from '../mock/mockApi'
import { productModule } from '../module'

// Pin the zone so formatted times are the same on every machine.
process.env.TZ = 'UTC'

/** The instant every UI test lives at. */
export const NOW = new Date('2026-11-19T12:00:00.000Z')
export const clock = () => new Date(NOW)

export interface Harness {
  mock: MockApi
  apiClient: ApiClient
  user: ReturnType<typeof userEvent.setup>
}

export interface HarnessOptions {
  path?: string
  seed?: MockApiOptions['seed']
  /** Requests wait for this promise, so a test can look at the loading state. */
  gate?: Promise<void>
  /** Runs against the mock before the first render (create appliances, add alerts). */
  prepare?: (mock: MockApi) => Promise<void> | void
}

/**
 * Mounts the module (at the root) the way the workspace does: signed in, inside the workspace's auth, API
 * client, query cache, theme and toasts, with the module's own providers and a fixed clock.
 */
export async function renderApp({
  path = '/',
  seed = 'demo',
  gate,
  prepare,
}: HarnessOptions = {}): Promise<Harness> {
  const mock = createMockApi({ clock, seed })
  await prepare?.(mock)
  const stub = createStubAuthClient({ initialUser: DEMO_USER })
  const apiClient = createApiClient({
    baseUrl: '/api',
    getToken: (force) => stub.getIdToken(force),
    fetch: gate
      ? async (input, init) => {
          await gate
          return mock.fetch(input, init)
        }
      : mock.fetch,
  })
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: 0 }, mutations: { retry: false } },
  })
  const { Providers = Fragment, Routes: ModuleRoutes } = productModule
  const user = userEvent.setup()
  render(
    <MemoryRouter initialEntries={[path]}>
      <ThemeProvider storageKey={null}>
        <AuthProvider client={stub}>
          <ApiProvider client={apiClient} queryClient={queryClient}>
            <ToastProvider>
              <RequireAuth loading={null} fallback={null}>
                <ModuleBaseProvider base="">
                  <Providers>
                    <ClockProvider clock={clock}>
                      {/* the workspace sidebar: one link per nav item */}
                      <nav aria-label="Workspace">
                        {productModule.nav.map((item) => (
                          <ModuleNavLink key={item.to} to={item.to} end={item.end ?? false}>
                            {item.label}
                          </ModuleNavLink>
                        ))}
                      </nav>
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
  await screen.findByRole('main')
  return { mock, apiClient, user }
}

/** The card of one appliance on the overview, found by its heading. */
export async function applianceCard(name: string): Promise<HTMLElement> {
  const heading = await screen.findByRole('heading', { level: 3, name })
  const card = heading.closest<HTMLElement>('.hp-appliance-card')
  if (!card) throw new Error(`No card for ${name}`)
  return card
}

export const inMain = () => within(screen.getByRole('main'))

/** Creates an appliance through the mock's own API, as the app would, and returns its id. */
export async function createAppliance(
  mock: MockApi,
  input: { name: string; type: string; location?: string },
): Promise<string> {
  const response = await mock.fetch('/api/v1/appliances', {
    method: 'POST',
    headers: { authorization: 'Bearer test', 'content-type': 'application/json' },
    body: JSON.stringify(input),
  })
  return ((await response.json()) as { id: string }).id
}
