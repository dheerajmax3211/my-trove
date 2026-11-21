import { ApiProvider, createApiClient } from '@platform/api-client'
import {
  ModuleBaseProvider,
  WorkspaceSessionProvider,
  createSession,
  type WorkspaceSession,
} from '@platform/workspace-kit'
import { QueryClient } from '@tanstack/react-query'
import { render } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom'
import { createAdminDemoFetch } from '../demo/demoFetch'
import { DEMO_PEOPLE, DEMO_ROLES, demoId } from '../demo/seed'
import { AdminRoutes } from '../routes'

export type TestPersona = 'OWNER' | 'ADMIN' | 'AUDITOR' | 'DEVELOPER' | 'MEMBER'

/** Which seeded person acts as each persona (their id is in the bearer token the demo API reads). */
export const ACTOR: Record<TestPersona, number> = {
  OWNER: 1,
  ADMIN: 2,
  AUDITOR: 3,
  DEVELOPER: 4,
  MEMBER: 5,
}

export function sessionFor(persona: TestPersona): WorkspaceSession {
  const person = DEMO_PEOPLE.find((p) => p.n === ACTOR[persona])
  const roles = persona === 'MEMBER' ? ['MEMBER'] : [persona, 'MEMBER']
  const permissions = [
    ...new Set(roles.flatMap((r) => DEMO_ROLES.find((d) => d.name === r)?.permissions ?? [])),
  ]
  return createSession({
    uid: demoId(ACTOR[persona]),
    email: person?.email ?? null,
    displayName: person?.name ?? null,
    roles,
    permissions,
    plan: person?.plan ?? 'FREE',
    isDemo: false,
  })
}

export interface RecordedRequest {
  method: string
  service: 'auth' | 'platform' | 'other'
  /** `/v1/...` */
  path: string
  search: URLSearchParams
  body: unknown
}

export const problem = (status: number, detail: string, title = 'Problem') =>
  new Response(JSON.stringify({ type: 'about:blank', title, status, detail }), {
    status,
    headers: { 'content-type': 'application/problem+json' },
  })

export const jsonResponse = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })

export interface HarnessOptions {
  persona?: TestPersona
  /** Route below the module base, e.g. `/users?q=ada`. */
  route?: string
  /** Return a Response to answer the request yourself, or undefined to let the demo API answer. */
  intercept?: (request: RecordedRequest) => Response | undefined | Promise<Response | undefined>
  session?: WorkspaceSession
}

export const BASE = '/app/admin'

function Where() {
  const location = useLocation()
  return <output data-testid="where">{location.pathname + location.search}</output>
}

/** Renders the console under `/app/admin` against the in-memory demo API, with a recorded request log. */
export function renderAdmin({
  persona = 'OWNER',
  route = '/',
  intercept,
  session,
}: HarnessOptions = {}) {
  const user = userEvent.setup()
  const requests: RecordedRequest[] = []
  const demo = createAdminDemoFetch()
  const actor = session?.uid ? Number(/(\d+)$/.exec(session.uid)?.[1] ?? 1) : ACTOR[persona]

  const fetchWithLog = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const url = new URL(
      typeof input === 'string' ? input : input instanceof URL ? input.href : input.url,
      'http://gw.test',
    )
    const service = url.pathname.startsWith('/api/auth/')
      ? 'auth'
      : url.pathname.startsWith('/api/platform/')
        ? 'platform'
        : 'other'
    const recorded: RecordedRequest = {
      method: (init?.method ?? 'GET').toUpperCase(),
      service,
      path: /\/v1\/.*$/.exec(url.pathname)?.[0] ?? url.pathname,
      search: url.searchParams,
      body: typeof init?.body === 'string' ? (JSON.parse(init.body) as unknown) : undefined,
    }
    requests.push(recorded)
    return (await intercept?.(recorded)) ?? demo(input, init)
  }

  const roles = (session ?? sessionFor(persona)).roles.join('+')
  const client = createApiClient({
    baseUrl: 'http://gw.test/api/auth',
    getToken: () => `demo:${roles}:${actor}`,
    fetch: fetchWithLog,
  })
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: 0 }, mutations: { retry: false } },
  })

  const view = render(
    <WorkspaceSessionProvider value={session ?? sessionFor(persona)}>
      <ApiProvider client={client} queryClient={queryClient}>
        <MemoryRouter initialEntries={[`${BASE}${route === '/' ? '' : route}`]}>
          <ModuleBaseProvider base={BASE}>
            <Routes>
              <Route path={`${BASE}/*`} element={<AdminRoutes />} />
            </Routes>
            <Where />
          </ModuleBaseProvider>
        </MemoryRouter>
      </ApiProvider>
    </WorkspaceSessionProvider>,
  )
  return { user, requests, queryClient, ...view }
}

export const callsTo = (requests: RecordedRequest[], method: string, path: string | RegExp) =>
  requests.filter(
    (r) => r.method === method && (typeof path === 'string' ? r.path === path : path.test(r.path)),
  )
