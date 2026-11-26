import { ApiProvider, createApiClient } from '@platform/api-client'
import { AuthProvider, RequireAuth } from '@platform/auth-web'
import { ThemeProvider, ToastProvider } from '@platform/ui'
import {
  ModuleBaseProvider,
  WorkspaceSessionProvider,
  createSession,
} from '@platform/workspace-kit'
import { QueryClient } from '@tanstack/react-query'
import { act, render } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { ReactNode } from 'react'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom'
import { ClockProvider } from '../clock'
import { introKey } from '../features/household/components/FirstUseNotice'
import { productModule } from '../module'
import { MockBackend } from '../mock/mockBackend'
import { DEMO_HOUSEHOLD, PERSONAS, seedDemo } from '../mock/seed'
import { createDemoAuthClient } from './demoAuth'
import { fixedClock, type Clock } from './fixtures'

export const BASE = '/app/family-treasury'

function Where() {
  const { pathname, search } = useLocation()
  return <p data-testid="where">{pathname + search}</p>
}

export interface ModuleRenderOptions {
  uid?: string | null
  /** Path inside the module (starts with `/`). Default: the module home. */
  path?: string | ((householdId: string) => string)
  seed?: boolean
  clock?: Clock
  /** Show the first-use notice instead of pre-dismissing it. */
  firstUse?: boolean
  prepare?: (backend: MockBackend, householdId: string) => void
  /** Rendered next to the module, inside its providers (for hooks such as `useTodayItems`). */
  beside?: ReactNode
  /** Mount under the workspace base (default) or at the root. */
  mounted?: boolean
}

/**
 * Mounts `productModule` the way the workspace does: its own providers and routes, inside the workspace's
 * auth, API client, query cache, theme, toasts and a `<main>` landmark. The API client talks to the in-memory
 * mock as whichever demo persona is signed in (`Authorization: Bearer demo:<uid>`).
 */
export function renderModule(options: ModuleRenderOptions = {}) {
  const {
    uid = 'u-maya',
    path = '',
    seed = true,
    firstUse = false,
    prepare,
    beside,
    mounted = true,
  } = options
  const clock = options.clock ?? fixedClock()
  window.localStorage.clear()
  if (!firstUse) for (const p of PERSONAS) window.localStorage.setItem(introKey(p.uid), 'yes')
  const backend = new MockBackend({ now: clock.now })
  if (seed) seedDemo(backend)
  const auth = createDemoAuthClient(PERSONAS, uid)
  const apiClient = createApiClient({
    baseUrl: '/api',
    getToken: () => auth.getIdToken(),
    fetch: backend.fetch,
  })
  const householdId = seed ? backend.householdByName(DEMO_HOUSEHOLD).id : ''
  prepare?.(backend, householdId)
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false, refetchOnWindowFocus: false },
      mutations: { retry: false },
    },
  })
  const base = mounted ? BASE : ''
  const { Providers, Routes: ModuleRoutes } = productModule
  const session = createSession({
    uid: uid ?? 'x',
    email: null,
    displayName: null,
    roles: [],
    permissions: ['products:use'],
    plan: 'FREE',
    isDemo: false,
  })
  const Wrap = Providers ?? (({ children }: { children: ReactNode }) => <>{children}</>)
  const user = userEvent.setup()
  const utils = render(
    <MemoryRouter
      initialEntries={[`${base}${typeof path === 'function' ? path(householdId) : path}`]}
    >
      <ThemeProvider storageKey={null}>
        <ToastProvider>
          <AuthProvider client={auth}>
            <ApiProvider client={apiClient} queryClient={queryClient}>
              <ClockProvider now={clock.now}>
                <WorkspaceSessionProvider value={session}>
                  <ModuleBaseProvider base={base}>
                    {/* the workspace mounts a module only once the session is known */}
                    <RequireAuth loading={null} fallback={null}>
                      <Wrap>
                        <main>
                          <Routes>
                            <Route
                              path={mounted ? `${BASE}/*` : '/*'}
                              element={
                                <>
                                  <ModuleRoutes />
                                  {beside}
                                </>
                              }
                            />
                          </Routes>
                        </main>
                        <Where />
                      </Wrap>
                    </RequireAuth>
                  </ModuleBaseProvider>
                </WorkspaceSessionProvider>
              </ClockProvider>
            </ApiProvider>
          </AuthProvider>
        </ToastProvider>
      </ThemeProvider>
    </MemoryRouter>,
  )
  /** Play another household member (what a different signed-in person would see). */
  const switchTo = (nextUid: string) =>
    act(async () => {
      queryClient.clear()
      auth.switchTo(nextUid)
      await Promise.resolve()
    })
  return { ...utils, user, backend, householdId, clock, queryClient, auth, switchTo }
}
