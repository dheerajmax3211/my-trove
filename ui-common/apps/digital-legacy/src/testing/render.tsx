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
import { render } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Fragment } from 'react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { afterEach, beforeEach, vi } from 'vitest'
import { ClockProvider } from '../lib/clock'
import { MockBackend } from '../mock/backend'
import { productModule } from '../module'
import { TrusteePortal } from '../trustee'

export interface Download {
  name: string
  text: string
}

/** jsdom has no downloads or object URLs: capture what the app would save, so tests can reuse it. */
export function setupBrowserStubs(): { downloads: Download[] } {
  const state = { downloads: [] as Download[] }
  const blobs = new Map<string, Blob>()
  let counter = 0
  beforeEach(() => {
    state.downloads = []
    blobs.clear()
    localStorage.clear()
    URL.createObjectURL = vi.fn((blob: Blob) => {
      counter += 1
      const url = `blob:test/${counter}`
      blobs.set(url, blob)
      return url
    })
    URL.revokeObjectURL = vi.fn()
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (
      this: HTMLAnchorElement,
    ) {
      const blob = blobs.get(this.href)
      if (!blob) return
      const reader = new FileReader()
      const name = this.download
      reader.onload = () =>
        state.downloads.push({ name, text: typeof reader.result === 'string' ? reader.result : '' })
      reader.readAsText(blob)
    })
  })
  afterEach(() => {
    localStorage.clear()
  })
  return state
}

export interface Rendered {
  mock: MockBackend
  user: ReturnType<typeof userEvent.setup>
}

/**
 * Renders what the workspace serves at `route`, against one in-memory backend: the public trustee portal
 * at `/trustee/*`, and otherwise the owner module (mounted at the root), signed in as the demo owner
 * unless `signedIn` is false. Both use the mock's clock, so `mock.advance` moves countdowns too.
 */
export function renderApp(
  route = '/',
  options: { mock?: MockBackend; signedIn?: boolean } = {},
): Rendered & ReturnType<typeof render> {
  const mock = options.mock ?? new MockBackend()
  const authClient = createStubAuthClient(
    options.signedIn === false ? {} : { initialUser: DEMO_USER },
  )
  const ownerClient = createApiClient({
    baseUrl: '/api',
    getToken: (force) => authClient.getIdToken(force),
    fetch: mock.fetch,
    onUnauthorized: () => void authClient.signOut(),
  })
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
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
  const now = () => mock.now()
  const { Providers = Fragment, Routes: ModuleRoutes } = productModule
  const user = userEvent.setup()
  const view = render(
    <MemoryRouter initialEntries={[route]}>
      <ThemeProvider storageKey={null}>
        <ToastProvider>
          <ClockProvider now={now}>
            <Routes>
              <Route
                path="/trustee/*"
                element={<TrusteePortal apiBaseUrl="/api" fetch={mock.fetch} now={now} />}
              />
              <Route
                path="*"
                element={
                  <AuthProvider client={authClient}>
                    <RequireAuth loading={null} fallback={<p>Signed out</p>}>
                      <WorkspaceSessionProvider value={session}>
                        <ApiProvider client={ownerClient} queryClient={queryClient}>
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
                        </ApiProvider>
                      </WorkspaceSessionProvider>
                    </RequireAuth>
                  </AuthProvider>
                }
              />
            </Routes>
          </ClockProvider>
        </ToastProvider>
      </ThemeProvider>
    </MemoryRouter>,
  )
  return { ...view, mock, user }
}
