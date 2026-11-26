import { ApiProvider, createApiClient } from '@platform/api-client'
import { AuthProvider, DEMO_USER, RequireAuth, createStubAuthClient } from '@platform/auth-web'
import { ThemeProvider, ToastProvider } from '@platform/ui'
import {
  ModuleBaseProvider,
  ModuleNavLink,
  WorkspaceSessionProvider,
  createSession,
} from '@platform/workspace-kit'
import { QueryClient } from '@tanstack/react-query'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Fragment } from 'react'
import { MemoryRouter } from 'react-router-dom'
import { SettingsProvider } from '../lib/settings'
import { createMockApi, type MockApiOptions } from '../mock/mockApi'
import { productModule } from '../module'

export interface RenderOptions {
  route?: string
  mock?: MockApiOptions
  wrapFetch?: (mockFetch: typeof fetch) => typeof fetch
  /** Forwarded to user-event, e.g. `{ applyAccept: false }` to upload a type the picker filters out. */
  userOptions?: Parameters<typeof userEvent.setup>[0]
}

/**
 * Mounts the module (at the root) the way the workspace does: signed in, inside the workspace's auth,
 * session, API client, query cache, theme and toasts, with a sidebar built from the module's nav. The
 * in-memory API has no latency, polling is fast and queries never retry.
 */
export function renderApp({ route = '/', mock, wrapFetch, userOptions }: RenderOptions = {}) {
  // Recent searches live in localStorage; every test starts with none.
  window.localStorage.clear()
  const api = createMockApi({ latencyMs: 0, ...mock })
  const authClient = createStubAuthClient({ initialUser: DEMO_USER })
  const apiClient = createApiClient({
    baseUrl: '/api',
    getToken: (force) => authClient.getIdToken(force),
    fetch: wrapFetch ? wrapFetch(api.fetch) : api.fetch,
    onUnauthorized: () => void authClient.signOut(),
  })
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: 30_000 }, mutations: { retry: false } },
  })
  const session = createSession({
    uid: DEMO_USER.uid,
    email: DEMO_USER.email,
    displayName: DEMO_USER.displayName,
    roles: [],
    permissions: ['products:use'],
    plan: 'FREE',
    isDemo: false,
  })
  const { Providers = Fragment, Routes: ModuleRoutes } = productModule
  const user = userEvent.setup(userOptions)
  const utils = render(
    <MemoryRouter initialEntries={[route]}>
      <ThemeProvider storageKey={null}>
        <AuthProvider client={authClient}>
          <ApiProvider client={apiClient} queryClient={queryClient}>
            <ToastProvider>
              <RequireAuth loading={null} fallback={<p>Signed out</p>}>
                <WorkspaceSessionProvider value={session}>
                  <ModuleBaseProvider base="">
                    <Providers>
                      <SettingsProvider value={{ pollIntervalMs: 10 }}>
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
                      </SettingsProvider>
                    </Providers>
                  </ModuleBaseProvider>
                </WorkspaceSessionProvider>
              </RequireAuth>
            </ToastProvider>
          </ApiProvider>
        </AuthProvider>
      </ThemeProvider>
    </MemoryRouter>,
  )
  return { runtime: { mock: api, apiClient }, user, queryClient, ...utils }
}

export const searchBox = () =>
  screen.getByRole('searchbox', { name: /search your notes, documents and receipts/i })

/** Resolves once the module has rendered inside the signed-in workspace. */
export const appReady = () => screen.findByRole('navigation', { name: 'Workspace' })

export async function runSearch(user: ReturnType<typeof userEvent.setup>, query: string) {
  const box = searchBox()
  await user.clear(box)
  await user.type(box, query)
  await user.click(screen.getByRole('button', { name: 'Search' }))
}
