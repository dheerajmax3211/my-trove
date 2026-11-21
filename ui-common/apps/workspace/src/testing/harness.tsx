import { useApiQuery } from '@platform/api-client'
import type { AuthClient, AuthUser } from '@platform/auth-web'
import { InboxIcon, type Persona } from '@platform/ui'
import {
  ModuleLink,
  useModulePath,
  type ProductModule,
  type TodayItem,
} from '@platform/workspace-kit'
import { render } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { vi, type Mock } from 'vitest'
import { Route, Routes, BrowserRouter } from 'react-router-dom'
import { App } from '../App'
import { memoryStorage, type Storages } from '../lib/storage'
import { PERSONA_PERMISSIONS, PERSONA_PLAN } from '../lib/personas'
import { onboardingKey } from '../onboarding/OnboardingProvider'
import { DEMO_PERSONA_KEY, createRuntime, type Runtime } from '../runtime'
import type { MeResponse } from '../workspace/SessionGate'

export const API = 'http://localhost:8080/api'
export const NOW = new Date('2026-11-21T10:00:00')

export function problem(status: number, title = 'Problem') {
  return new Response(JSON.stringify({ type: 'about:blank', title, status }), {
    status,
    headers: { 'content-type': 'application/problem+json' },
  })
}

export function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  })
}

// ---------------------------------------------------------------------------------------------
// Fake modules. Today the real ones are stubs, so the mounting logic is tested against these.

function ItemsPage({ title }: { title: string }) {
  const path = useModulePath()
  const items = useApiQuery<{ name: string }>('/v1/items')
  return (
    <div>
      <h1>{title} home</h1>
      <p data-testid="items">
        {items.isPending ? 'loading items' : items.isError ? 'items failed' : items.data.name}
      </p>
      <p data-testid="resolved">{path('/detail')}</p>
      <ModuleLink to="/detail">Open {title} detail</ModuleLink>
    </div>
  )
}

export interface FakeModuleOptions extends Partial<ProductModule> {
  todayItems?: TodayItem[]
  /** Give the module an in-memory demo API that answers `/v1/items`. */
  demoName?: string
}

export function fakeModule(id: string, options: FakeModuleOptions = {}): ProductModule {
  const { todayItems, demoName, ...rest } = options
  const title = id.charAt(0).toUpperCase() + id.slice(1)
  return {
    id,
    service: id,
    title,
    tagline: `${title} tagline`,
    description: `${title} description`,
    accent: 'var(--pp-color-accent)',
    icon: InboxIcon,
    nav: [
      { to: '/', label: `${title} home`, end: true },
      { to: '/detail', label: `${title} detail` },
      { to: '/secret', label: `${title} secret`, permission: 'flags:manage' },
    ],
    Routes: () => (
      <Routes>
        <Route index element={<ItemsPage title={title} />} />
        <Route path="detail" element={<h1>{title} detail page</h1>} />
        <Route path="*" element={<h1>{title} elsewhere</h1>} />
      </Routes>
    ),
    ...(todayItems ? { useTodayItems: () => ({ items: todayItems, loading: false }) } : {}),
    ...(demoName
      ? {
          createDemoFetch: () => () => Promise.resolve(json({ name: demoName })),
        }
      : {}),
    ...rest,
  }
}

export function fakeAdmin(): ProductModule {
  return fakeModule('admin', {
    title: 'Admin',
    nav: [
      { to: '/', label: 'Overview', end: true },
      { to: '/users', label: 'Users', permission: 'users:read' },
    ],
    Routes: () => <h1>ADMIN CONSOLE CONTENT</h1>,
  })
}

// ---------------------------------------------------------------------------------------------
// Auth

export const USER_A: AuthUser = {
  uid: 'user-a',
  email: 'a@example.test',
  displayName: 'Ada Lovelace',
  photoURL: null,
  emailVerified: true,
}
export const USER_B: AuthUser = {
  ...USER_A,
  uid: 'user-b',
  email: 'b@example.test',
  displayName: 'Bo Burnham',
}

export interface TestAuth extends AuthClient {
  user: () => AuthUser | null
  signInAs: (user: AuthUser) => void
}

/** A controllable AuthClient: tokens are `token-<uid>`. */
export function createTestAuth(initial: AuthUser | null): TestAuth {
  let current = initial
  const listeners = new Set<(user: AuthUser | null) => void>()
  const emit = () => listeners.forEach((listener) => listener(current))
  return {
    user: () => current,
    signInAs(user) {
      current = user
      emit()
    },
    onAuthStateChanged(next) {
      listeners.add(next)
      queueMicrotask(() => {
        if (listeners.has(next)) next(current)
      })
      return () => listeners.delete(next)
    },
    getIdToken: () => Promise.resolve(current ? `token-${current.uid}` : null),
    signInWithGoogle: () => {
      current = USER_A
      emit()
      return Promise.resolve()
    },
    sendEmailLink: () => Promise.resolve(),
    isEmailLink: () => false,
    completeEmailLinkSignIn: () => Promise.resolve(),
    signOut: () => {
      current = null
      emit()
      return Promise.resolve()
    },
  }
}

// ---------------------------------------------------------------------------------------------
// Rendering

export function meFor(persona: Persona, overrides: Partial<MeResponse> = {}): MeResponse {
  return {
    id: 'me-1',
    email: 'a@example.test',
    displayName: 'Ada Lovelace',
    roles: [persona],
    permissions: [...PERSONA_PERMISSIONS[persona]],
    plan: PERSONA_PLAN[persona],
    ...overrides,
  }
}

export function memoryStorages(): Storages {
  return { local: memoryStorage(), session: memoryStorage() }
}

export type Handler = (
  url: URL,
  init: RequestInit | undefined,
) => Response | Promise<Response> | undefined

/** A fetch mock that answers `/auth/v1/me` from `me()` and everything else from `handler`, else 404. */
export function createFetchMock(
  me: () => MeResponse | Response,
  handler?: Handler,
): Mock<typeof fetch> {
  return vi.fn<typeof fetch>((input, init) => {
    const url = new URL(
      typeof input === 'string' ? input : input instanceof URL ? input.href : input.url,
    )
    if (url.pathname.endsWith('/auth/v1/me')) {
      const value = me()
      return Promise.resolve(value instanceof Response ? value : json(value))
    }
    const answer = handler?.(url, init)
    return answer ? Promise.resolve(answer) : Promise.resolve(problem(404, 'Not found'))
  })
}

/** The URL of a fetch call's first argument, as a string. */
export function urlOf(input: Parameters<typeof fetch>[0]): string {
  return typeof input === 'string' ? input : input instanceof URL ? input.href : input.url
}

export function authHeader(init: RequestInit | undefined): string | null {
  return new Headers(init?.headers).get('authorization')
}

export interface RenderOptions {
  /** URL to start at. */
  path?: string
  modules?: readonly ProductModule[]
  storage?: Storages
  /** Skip the first-run wizard for this uid (default: skipped for `me-1` / `demo-user`). */
  onboarded?: boolean | string[]
  /** The clock for greetings, due dates and the usage month. */
  now?: Date
}

function seedOnboarding(storage: Storages, uid: string, onboarded: RenderOptions['onboarded']) {
  if (onboarded === false) return
  const pinned = Array.isArray(onboarded) ? onboarded : []
  storage.local?.setItem(onboardingKey(uid), JSON.stringify({ status: 'done', pinned }))
}

export function mountApp(runtime: Runtime, modules: readonly ProductModule[], path: string) {
  window.history.replaceState(null, '', path)
  const user = userEvent.setup()
  const view = render(
    <BrowserRouter>
      <App runtime={runtime} modules={modules} />
    </BrowserRouter>,
  )
  return { user, ...view }
}

/** Demo mode as a given persona: stub sign-in, in-memory mock APIs, no network. */
export function renderDemo(persona: Persona, options: RenderOptions & { search?: string } = {}) {
  const {
    path = '/',
    modules = [],
    storage = memoryStorages(),
    onboarded = true,
    now = NOW,
  } = options
  storage.session?.setItem(DEMO_PERSONA_KEY, persona)
  seedOnboarding(storage, 'demo-user', onboarded)
  const runtime = createRuntime(
    {},
    { search: options.search ?? '?demo=1', storage, now: () => now, retryQueries: false },
  )
  return { runtime, storage, ...mountApp(runtime, modules, path) }
}

export interface LiveOptions extends RenderOptions {
  me?: () => MeResponse | Response
  handler?: Handler
  auth?: TestAuth
  persona?: Persona
}

/** A live-mode runtime: a real-looking gateway behind a fetch mock, a controllable identity. */
export function createLiveRuntime(options: LiveOptions = {}) {
  const storage = options.storage ?? memoryStorages()
  const persona = options.persona ?? 'MEMBER'
  const me = options.me ?? (() => meFor(persona))
  const fetchMock = createFetchMock(me, options.handler)
  const auth = options.auth ?? createTestAuth(USER_A)
  const runtime = createRuntime(
    { VITE_DEV_IDP_URL: 'http://idp.test', VITE_API_BASE_URL: API },
    {
      search: '',
      storage,
      now: () => options.now ?? NOW,
      authClient: auth,
      fetch: fetchMock,
      retryQueries: false,
    },
  )
  return { runtime, fetchMock, auth, storage }
}

export function renderLive(options: LiveOptions = {}) {
  const live = createLiveRuntime(options)
  const { modules = [], path = '/', onboarded = true } = options
  seedOnboarding(live.storage, 'me-1', onboarded)
  return { ...live, ...mountApp(live.runtime, modules, path) }
}
