import { ApiProvider } from '@platform/api-client'
import { AuthProvider } from '@platform/auth-web'
import { ThemeProvider, ToastProvider } from '@platform/ui'
import {
  ModuleBaseProvider,
  WorkspaceSessionProvider,
  createSession,
} from '@platform/workspace-kit'
import { QueryClient } from '@tanstack/react-query'
import { render } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { ReactNode } from 'react'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom'
import { ClockProvider } from '../clock'
import { introKey } from '../features/household/components/FirstUseNotice'
import { productModule } from '../module'
import { DEMO_HOUSEHOLD, PERSONAS } from '../mock/seed'
import type { MockBackend } from '../mock/mockBackend'
import { createDemoRuntime } from '../runtime'
import { fixedClock } from './fixtures'

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
  prepare?: (backend: MockBackend, householdId: string) => void
  /** Rendered next to the module, inside its providers (for hooks such as `useTodayItems`). */
  beside?: ReactNode
  /** Mount under the workspace base (default) or at the root like a standalone app. */
  mounted?: boolean
}

/** Mounts `productModule` the way the workspace does: under `/app/family-treasury`, with its own providers. */
export function renderModule(options: ModuleRenderOptions = {}) {
  const { uid = 'u-maya', path = '', seed = true, prepare, beside, mounted = true } = options
  const clock = fixedClock()
  window.localStorage.clear()
  for (const p of PERSONAS) window.localStorage.setItem(introKey(p.uid), 'yes')
  const runtime = createDemoRuntime({ initialUid: uid, now: clock.now, seed })
  const backend = runtime.demo!.backend
  const householdId = seed ? backend.householdByName(DEMO_HOUSEHOLD).id : ''
  prepare?.(backend, householdId)
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, refetchOnWindowFocus: false } },
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
          <AuthProvider client={runtime.authClient}>
            <ApiProvider client={runtime.apiClient} queryClient={queryClient}>
              <ClockProvider now={clock.now}>
                <WorkspaceSessionProvider value={session}>
                  <ModuleBaseProvider base={base}>
                    <Wrap>
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
                      <Where />
                    </Wrap>
                  </ModuleBaseProvider>
                </WorkspaceSessionProvider>
              </ClockProvider>
            </ApiProvider>
          </AuthProvider>
        </ToastProvider>
      </ThemeProvider>
    </MemoryRouter>,
  )
  return { ...utils, user, backend, householdId, runtime, clock, queryClient }
}
