import { ApiProvider, createApiClient } from '@platform/api-client'
import { AuthProvider, DEMO_USER, RequireAuth, createStubAuthClient } from '@platform/auth-web'
import { ThemeProvider, ToastProvider } from '@platform/ui'
import { ModuleBaseProvider, ModuleNavLink } from '@platform/workspace-kit'
import { QueryClient } from '@tanstack/react-query'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Fragment } from 'react'
import { MemoryRouter } from 'react-router-dom'
import { createMockBackend, type MockBackend } from '../mock/backend'
import { productModule } from '../module'

export interface RenderOptions {
  route?: string
  backend?: MockBackend
  seed?: 'demo' | 'empty'
}

/**
 * Mounts the module (at the root) the way the workspace does: signed in, inside the workspace's auth, API
 * client, query cache, theme and toasts, against the in-memory mock gateway. No latency, no retries.
 */
export function renderApp({ route = '/', backend, seed = 'demo' }: RenderOptions = {}) {
  const gateway = backend ?? createMockBackend({ seed })
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false, refetchOnWindowFocus: false },
      mutations: { retry: false },
    },
  })
  const authClient = createStubAuthClient({ initialUser: DEMO_USER })
  const apiClient = createApiClient({
    baseUrl: '/api',
    getToken: (force) => authClient.getIdToken(force),
    fetch: gateway.fetch,
    onUnauthorized: () => void authClient.signOut(),
  })
  const { Providers = Fragment, Routes: ModuleRoutes } = productModule
  const user = userEvent.setup()
  render(
    <MemoryRouter initialEntries={[route]}>
      <ThemeProvider storageKey={null}>
        <AuthProvider client={authClient}>
          <ApiProvider client={apiClient} queryClient={queryClient}>
            <ToastProvider>
              <RequireAuth loading={null} fallback={<p>Signed out</p>}>
                <ModuleBaseProvider base="">
                  <Providers>
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
                  </Providers>
                </ModuleBaseProvider>
              </RequireAuth>
            </ToastProvider>
          </ApiProvider>
        </AuthProvider>
      </ThemeProvider>
    </MemoryRouter>,
  )
  return { user, backend: gateway, runtime: { apiClient, queryClient, authClient } }
}

/** The page's single h1, once it has rendered. */
export const pageHeading = (name: string) => screen.findByRole('heading', { level: 1, name })

export const dialog = () => within(screen.getByRole('dialog'))

export const callsTo = (backend: MockBackend, method: string, pathPart: string) =>
  backend.calls.filter((c) => c.method === method && c.path.includes(pathPart))
