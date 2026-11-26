import { ApiProvider, createApiClient, createApiQueryClient } from '@platform/api-client'
import { AuthProvider, RequireAuth, useAuth } from '@platform/auth-web'
import { Select, ThemeProvider, ToastProvider } from '@platform/ui'
import {
  ModuleBaseProvider,
  ModuleNavLink,
  WorkspaceSessionProvider,
  createSession,
} from '@platform/workspace-kit'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { QueryClient } from '@tanstack/react-query'
import { Fragment, useMemo, useState } from 'react'
import { MemoryRouter } from 'react-router-dom'
import { CoreEnvProvider, saveFromTransport, type CoreEnv } from '../core/env'
import { createMockBackend } from '../mock/backend'
import { DEMO_USERS, type SeedKind } from '../mock/seed'
import { productModule } from '../module'
import { createDemoAuthClient, type DemoAuthClient } from './demoAuth'

/** A fixed "now" so due dates, relative times and expiry are the same on every run. */
export const NOW = Date.parse('2026-11-19T09:00:00Z')

const API_ROOT = '/api/shared'

export interface RecordedRequest {
  method: string
  path: string
  query: URLSearchParams
  /** Parsed JSON, a FormData, or undefined. */
  body: unknown
  /** Whether a bearer token was sent. */
  authorized: boolean
}

export interface RenderHubOptions {
  /** Demo user to start signed in as. Default Alice. */
  as?: string
  route?: string
  seed?: SeedKind
  /** Return a Response to replace the backend's answer (fault injection). */
  respond?: (request: RecordedRequest) => Response | undefined
}

/** Stands in for "somebody else signs in to the workspace": the whole module remounts for them. */
function UserSwitcher({ auth }: { auth: DemoAuthClient }) {
  const { user } = useAuth()
  return (
    <Select
      aria-label="Switch demo user"
      value={user?.uid ?? ''}
      onChange={(e) => void auth.signInAs(e.target.value)}
    >
      {DEMO_USERS.map((u) => (
        <option key={u.uid} value={u.uid}>
          {u.displayName}
        </option>
      ))}
    </Select>
  )
}

/** One signed-in person's module: its own API client and query cache, as the workspace builds per user. */
function SignedInModule({
  auth,
  fetchImpl,
  env,
  newQueryClient,
}: {
  auth: DemoAuthClient
  fetchImpl: typeof fetch
  env: CoreEnv
  newQueryClient: () => QueryClient
}) {
  const { user } = useAuth()
  const [client] = useState(() =>
    createApiClient({
      baseUrl: API_ROOT,
      getToken: () => auth.getIdToken(),
      fetch: fetchImpl,
      onUnauthorized: () => void auth.signOut(),
    }),
  )
  const [queryClient] = useState(newQueryClient)
  const session = useMemo(
    () =>
      createSession({
        uid: user?.uid ?? 'x',
        email: user?.email ?? null,
        displayName: user?.displayName ?? null,
        roles: ['MEMBER'],
        permissions: ['products:use'],
        plan: 'FREE',
        isDemo: false,
      }),
    [user?.uid, user?.email, user?.displayName],
  )
  const { Providers = Fragment, Routes: ModuleRoutes } = productModule
  return (
    <WorkspaceSessionProvider value={session}>
      <ModuleBaseProvider base="">
        <ApiProvider client={client} queryClient={queryClient}>
          <Providers>
            {/* the demo clock and the demo cast's names, inside the module's own environment */}
            <CoreEnvProvider env={env}>
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
            </CoreEnvProvider>
          </Providers>
        </ApiProvider>
      </ModuleBaseProvider>
    </WorkspaceSessionProvider>
  )
}

function KeyedByUser(props: {
  auth: DemoAuthClient
  fetchImpl: typeof fetch
  env: CoreEnv
  newQueryClient: () => QueryClient
}) {
  const { user } = useAuth()
  return <SignedInModule key={user?.uid} {...props} />
}

/**
 * Mounts the Household (`core`) module at the root the way the workspace does, signed in as a demo user,
 * against the in-memory shared service with a fixed clock. Records every request.
 */
export function renderHub(options: RenderHubOptions = {}) {
  const { as = 'demo-alice', route = '/', seed = 'empty', respond } = options
  const requests: RecordedRequest[] = []
  const backend = createMockBackend({ now: () => NOW, seed })
  const fetchImpl: typeof fetch = async (input, init) => {
    const url = new URL(
      typeof input === 'string' ? input : input instanceof URL ? input.href : input.url,
      'http://localhost',
    )
    const raw = init?.body
    let body: unknown = raw ?? undefined
    if (typeof raw === 'string') {
      try {
        body = JSON.parse(raw)
      } catch {
        body = raw
      }
    }
    const recorded: RecordedRequest = {
      method: (init?.method ?? 'GET').toUpperCase(),
      path: url.pathname,
      query: url.searchParams,
      body,
      authorized: new Headers(init?.headers).has('authorization'),
    }
    requests.push(recorded)
    return respond?.(recorded) ?? backend.fetch(input, init)
  }
  const auth = createDemoAuthClient({ users: DEMO_USERS, initialUid: as })
  const env: CoreEnv = {
    now: backend.now,
    downloadUrl: (path) => `${API_ROOT}${path}`,
    saveDownload: (url, fileName) => saveFromTransport(fetchImpl, url, fileName),
    directory: Object.fromEntries(DEMO_USERS.map((u) => [u.uid, u.displayName])),
  }
  const sharedApi = createApiClient({
    baseUrl: API_ROOT,
    getToken: () => auth.getIdToken(),
    fetch: fetchImpl,
  })

  // One query cache per signed-in person (the module remounts on a user switch); the latest is kept so the
  // clock helper can mark its data stale.
  let current: QueryClient | null = null
  const newQueryClient = () => {
    const qc = createApiQueryClient()
    qc.setDefaultOptions({
      ...qc.getDefaultOptions(),
      queries: { ...qc.getDefaultOptions().queries, retry: false },
    })
    current = qc
    return qc
  }
  const user = userEvent.setup()
  render(
    <MemoryRouter initialEntries={[route]}>
      <ThemeProvider storageKey={null}>
        <AuthProvider client={auth}>
          <ToastProvider>
            <RequireAuth loading={null} fallback={<p>Signed out</p>}>
              <UserSwitcher auth={auth} />
              <KeyedByUser
                auth={auth}
                fetchImpl={fetchImpl}
                env={env}
                newQueryClient={newQueryClient}
              />
            </RequireAuth>
          </ToastProvider>
        </AuthProvider>
      </ThemeProvider>
    </MemoryRouter>,
  )
  /** Moves the mock's clock forward (due reminders fire) and marks cached data stale, as a reload would. */
  const advanceClock = (ms: number) => {
    backend.advanceClock(ms)
    return current?.invalidateQueries() ?? Promise.resolve()
  }
  return { runtime: { sharedApi, demo: { advanceClock } }, user, requests }
}

/** Requests made to a path, optionally narrowed by method. */
export const callsTo = (requests: RecordedRequest[], method: string, path: string | RegExp) =>
  requests.filter(
    (r) => r.method === method && (typeof path === 'string' ? r.path === path : path.test(r.path)),
  )

/** The page's single h1, once the module has loaded. */
export const pageHeading = (name: string | RegExp) =>
  screen.findByRole('heading', { level: 1, name })

export const problem = (status: number, detail: string): Response =>
  new Response(JSON.stringify({ type: 'about:blank', title: 'Error', status, detail }), {
    status,
    headers: { 'content-type': 'application/problem+json' },
  })

/** A link in the workspace sidebar (page bodies may repeat the same label). */
export const navLink = async (name: string) =>
  within(await screen.findByRole('navigation', { name: 'Workspace' })).getByRole('link', { name })
