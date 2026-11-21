import { createApiClient, type ApiClient } from '@platform/api-client'
import {
  DEMO_USER,
  createFirebaseAuthClient,
  createStubAuthClient,
  getFirebaseConfigFromEnv,
  isFirebaseConfigured,
  type AuthClient,
  type StubAuthClient,
} from '@platform/auth-web'
import { createContext, useContext, type ReactNode } from 'react'
import { systemClock, type Clock } from './lib/clock'
import { createMockApi } from './mock/mockApi'

type Env = Record<string, string | boolean | undefined>

export interface Runtime {
  /** `demo`: stub sign-in and an in-memory mock API. `live`: Firebase sign-in and the real service. */
  mode: 'demo' | 'live'
  authClient: AuthClient
  /** Present in demo mode only. */
  stub: StubAuthClient | null
  apiClient: ApiClient
  clock: Clock
  /** Where devices should send readings, for the setup snippets. */
  ingestBaseUrl: string
}

const str = (value: string | boolean | undefined): string | undefined =>
  typeof value === 'string' && value.trim() !== '' ? value.trim() : undefined

/** Demo mode unless Firebase is configured; `VITE_USE_MOCK=true` forces it even then. */
export function isDemoMode(env: Env): boolean {
  return str(env.VITE_USE_MOCK) === 'true' || !isFirebaseConfigured(env)
}

export function createRuntime(env: Env = import.meta.env, clock: Clock = systemClock): Runtime {
  if (isDemoMode(env)) {
    // Demo starts signed in: nothing to configure, nothing to click through.
    const stub = createStubAuthClient({ initialUser: DEMO_USER, latencyMs: 100 })
    const mock = createMockApi({ clock, latencyMs: 250 })
    return {
      mode: 'demo',
      authClient: stub,
      stub,
      apiClient: createApiClient({
        baseUrl: '/api',
        getToken: (force) => stub.getIdToken(force),
        fetch: mock.fetch,
        onUnauthorized: () => void stub.signOut(),
      }),
      clock,
      ingestBaseUrl: 'https://your-home-pulse-host.example',
    }
  }
  const authClient = createFirebaseAuthClient(getFirebaseConfigFromEnv(env))
  const baseUrl = str(env.VITE_API_BASE_URL) ?? '/api'
  return {
    mode: 'live',
    authClient,
    stub: null,
    apiClient: createApiClient({
      baseUrl,
      getToken: (force) => authClient.getIdToken(force),
      onUnauthorized: () => void authClient.signOut(),
    }),
    clock,
    ingestBaseUrl: /^https?:\/\//.test(baseUrl) ? baseUrl : `${window.location.origin}${baseUrl}`,
  }
}

const RuntimeContext = createContext<Runtime | null>(null)

export function RuntimeProvider({ runtime, children }: { runtime: Runtime; children: ReactNode }) {
  return <RuntimeContext value={runtime}>{children}</RuntimeContext>
}

/**
 * Where a device should send readings. The standalone app knows it from its runtime. Inside the workspace there is no
 * runtime, so it is the gateway route for this service (`VITE_API_BASE_URL` is `<gateway>/api`, the workspace's own
 * setting), falling back to this origin's `/api`.
 */
export function useIngestBaseUrl(): string {
  const runtime = useContext(RuntimeContext)
  if (runtime) return runtime.ingestBaseUrl
  const configured = import.meta.env.VITE_API_BASE_URL
  const base =
    typeof configured === 'string' && configured.trim() !== ''
      ? configured.trim().replace(/\/+$/, '')
      : `${window.location.origin}/api`
  return `${base}/home-pulse`
}

export function useRuntime(): Runtime {
  const runtime = useContext(RuntimeContext)
  if (!runtime) throw new Error('useRuntime must be used within <RuntimeProvider>')
  return runtime
}
