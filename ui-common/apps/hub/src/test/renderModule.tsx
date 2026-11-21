import { ApiProvider, createApiClient, createApiQueryClient } from '@platform/api-client'
import { AuthProvider, DEMO_USER, createStubAuthClient } from '@platform/auth-web'
import { ThemeProvider, ToastProvider } from '@platform/ui'
import {
  ModuleBaseProvider,
  WorkspaceSessionProvider,
  createSession,
  type ProductModule,
} from '@platform/workspace-kit'
import { render } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom'
import { productModule } from '../module'

export interface ModuleRequest {
  method: string
  url: string
}

export interface RenderModuleOptions {
  /** Path inside the module, e.g. `/reminders`. Default `/`. */
  route?: string
  base?: string
  /** The module's demo fetch is used unless this replaces it. */
  fetch?: typeof fetch
  module?: ProductModule
}

function Where() {
  return <output data-testid="where">{useLocation().pathname}</output>
}

/**
 * Mounts the module the way the workspace does: under `base`, with an API client bound to the shared service,
 * its own query cache, the module's providers and a stub sign-in. Records every request that leaves the client.
 */
export function renderModule(options: RenderModuleOptions = {}) {
  const { route = '/', base = '/app/core', module = productModule } = options
  const requests: ModuleRequest[] = []
  const inner = options.fetch ?? module.createDemoFetch?.()
  if (!inner) throw new Error('The module has no demo fetch')
  const recording: typeof fetch = (input, init) => {
    requests.push({
      method: (init?.method ?? 'GET').toUpperCase(),
      url: typeof input === 'string' ? input : input instanceof URL ? input.href : input.url,
    })
    return inner(input, init)
  }
  const auth = createStubAuthClient({ initialUser: DEMO_USER })
  const client = createApiClient({
    baseUrl: 'http://gateway.test/api/shared',
    getToken: (force) => auth.getIdToken(force),
    fetch: recording,
  })
  const queryClient = createApiQueryClient()
  queryClient.setDefaultOptions({
    ...queryClient.getDefaultOptions(),
    queries: { ...queryClient.getDefaultOptions().queries, retry: false },
  })
  const session = createSession({
    uid: 'u1',
    email: DEMO_USER.email,
    displayName: DEMO_USER.displayName,
    roles: ['MEMBER'],
    permissions: ['products:use'],
    plan: 'FREE',
    isDemo: true,
  })
  const { Providers = ({ children }) => <>{children}</>, Routes: ModuleRoutes } = module
  const user = userEvent.setup()
  const view = render(
    <MemoryRouter initialEntries={[`${base}${route === '/' ? '' : route}`]}>
      <ThemeProvider storageKey={null}>
        <AuthProvider client={auth}>
          <ToastProvider>
            <WorkspaceSessionProvider value={session}>
              <ModuleBaseProvider base={base}>
                <ApiProvider client={client} queryClient={queryClient}>
                  <Providers>
                    <Routes>
                      <Route path={`${base}/*`} element={<ModuleRoutes />} />
                    </Routes>
                  </Providers>
                </ApiProvider>
              </ModuleBaseProvider>
            </WorkspaceSessionProvider>
          </ToastProvider>
        </AuthProvider>
      </ThemeProvider>
      <Where />
    </MemoryRouter>,
  )
  return { ...view, user, requests, queryClient }
}
