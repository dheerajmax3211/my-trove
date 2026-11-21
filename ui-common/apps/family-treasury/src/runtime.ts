import { createApiClient, type ApiClient } from '@platform/api-client'
import {
  createFirebaseAuthClient,
  getFirebaseConfigFromEnv,
  isFirebaseConfigured,
  type AuthClient,
} from '@platform/auth-web'
import { createDemoAuthClient, type DemoAuthClient } from './features/auth/demoAuth'
import { MockBackend, type MockBackendOptions } from './mock/mockBackend'
import { PERSONAS, seedDemo, type Persona } from './mock/seed'

export interface DemoParts {
  auth: DemoAuthClient
  backend: MockBackend
  personas: readonly Persona[]
}

export interface Runtime {
  mode: 'demo' | 'live'
  authClient: AuthClient
  apiClient: ApiClient
  /** Present only in demo mode. */
  demo: DemoParts | null
  /** Human-readable description of where API calls go. */
  apiTarget: string
  /** The app's clock (the mock's in demo mode, so dates line up). */
  now: () => Date
}

type Env = Record<string, string | boolean | undefined>

export interface DemoRuntimeOptions extends MockBackendOptions {
  /** Start signed in as this persona. Default: signed out (the persona picker shows). */
  initialUid?: string | null
  backend?: MockBackend
  /** Fill the mock with the demo household history. Default true. */
  seed?: boolean
}

export function createDemoRuntime({
  initialUid = null,
  backend: provided,
  seed = true,
  ...backendOptions
}: DemoRuntimeOptions = {}): Runtime {
  const backend = provided ?? new MockBackend(backendOptions)
  if (!provided && seed) seedDemo(backend)
  const auth = createDemoAuthClient(PERSONAS, initialUid)
  const apiClient = createApiClient({
    baseUrl: '/api/v1',
    getToken: () => auth.getIdToken(),
    fetch: backend.fetch,
    onUnauthorized: () => void auth.signOut(),
  })
  return {
    mode: 'demo',
    authClient: auth,
    apiClient,
    demo: { auth, backend, personas: PERSONAS },
    apiTarget: 'in-memory mock of the family-treasury API',
    now: backend.now,
  }
}

const str = (v: string | boolean | undefined): string | undefined =>
  typeof v === 'string' && v.trim() !== '' ? v.trim() : undefined

/**
 * Demo mode (mock API + persona sign-in) when VITE_USE_MOCK=true, or when VITE_USE_MOCK is unset and no Firebase
 * config is present. Otherwise: Firebase Auth against the real backend.
 */
export function createRuntime(env: Env = import.meta.env): Runtime {
  const flag = str(env.VITE_USE_MOCK)
  const useMock = flag === 'true' || (flag !== 'false' && !isFirebaseConfigured(env))
  if (useMock) return createDemoRuntime({ latencyMs: 200 })

  const authClient = createFirebaseAuthClient(getFirebaseConfigFromEnv(env))
  const origin = str(env.VITE_API_BASE_URL)?.replace(/\/+$/, '')
  const baseUrl = origin ? `${origin}/v1` : '/api/v1'
  const apiClient = createApiClient({
    baseUrl,
    getToken: (force) => authClient.getIdToken(force),
    onUnauthorized: () => void authClient.signOut(),
  })
  return {
    mode: 'live',
    authClient,
    apiClient,
    demo: null,
    apiTarget: baseUrl,
    now: () => new Date(),
  }
}
