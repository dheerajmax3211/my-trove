import { ApiProvider, createApiClient } from '@platform/api-client'
import { ThemeProvider, ToastProvider } from '@platform/ui'
import {
  ModuleBaseProvider,
  WorkspaceSessionProvider,
  createSession,
} from '@platform/workspace-kit'
import { QueryClient } from '@tanstack/react-query'
import { render } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom'
import { productModule } from '../module'
import { createMockApi, type MockApiOptions } from '../mock/mockApi'

export const BASE = '/app/ask-your-life'

function Where() {
  const { pathname, search } = useLocation()
  return <output data-testid="where">{pathname + search}</output>
}

/**
 * Mounts the product the way the workspace does: its own providers, an API client bound to the
 * gateway route (`http://gateway.test/api/ask-your-life`), a per-module query cache, a module base.
 */
export function renderModule({
  route = BASE,
  mock,
  wrapFetch,
}: {
  route?: string
  mock?: MockApiOptions
  wrapFetch?: (mockFetch: typeof fetch) => typeof fetch
} = {}) {
  window.localStorage.clear()
  const api = createMockApi({ latencyMs: 0, ...mock })
  const requests = api.requests
  const client = createApiClient({
    baseUrl: 'http://gateway.test/api/ask-your-life',
    getToken: () => Promise.resolve('test-token'),
    fetch: wrapFetch ? wrapFetch(api.fetch) : api.fetch,
  })
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: 30_000 }, mutations: { retry: false } },
  })
  const { Providers, Routes: ModuleRoutes } = productModule
  const session = createSession({
    uid: 'user-1',
    email: 'user@example.test',
    displayName: null,
    roles: ['MEMBER'],
    permissions: ['products:use'],
    plan: 'FREE',
    isDemo: false,
  })
  const user = userEvent.setup()
  const utils = render(
    <MemoryRouter initialEntries={[route]}>
      <ThemeProvider>
        <WorkspaceSessionProvider value={session}>
          <ModuleBaseProvider base={BASE}>
            <ApiProvider client={client} queryClient={queryClient}>
              <ToastProvider>
                {Providers ? (
                  <Providers>
                    <Routes>
                      <Route path={`${BASE}/*`} element={<ModuleRoutes />} />
                    </Routes>
                  </Providers>
                ) : null}
                <Where />
              </ToastProvider>
            </ApiProvider>
          </ModuleBaseProvider>
        </WorkspaceSessionProvider>
      </ThemeProvider>
    </MemoryRouter>,
  )
  return { user, requests, queryClient, ...utils }
}

/** Every link on the page that points somewhere inside the app. */
export const allHrefs = (container: HTMLElement): string[] =>
  [...container.querySelectorAll('a[href]')].map((a) => a.getAttribute('href') ?? '')
