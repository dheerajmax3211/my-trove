import { createApiClient, type ApiClient } from '@platform/api-client'
import {
  createFirebaseAuthClient,
  createStubAuthClient,
  DEMO_USER,
  getFirebaseConfigFromEnv,
  isFirebaseConfigured,
  type AuthClient,
  type StubAuthClient,
} from '@platform/auth-web'
import { createTrusteeClient } from './api/trusteeApi'
import { MockBackend } from './mock/backend'

export type AuthMode = 'stub' | 'firebase' | 'emulator'
type Env = Record<string, string | boolean | undefined>

export interface Runtime {
  authMode: AuthMode
  authClient: AuthClient
  /** Present only in demo mode. */
  stub: StubAuthClient | null
  /** Firebase-authenticated client for the owner app. */
  ownerClient: ApiClient
  /** A fresh trustee-token client (own instance: no Firebase involved). */
  createTrusteeClient: (token: string | null) => ApiClient
  /** The clock the UI counts down against: the mock's (fast-forwardable) clock in demo mode. */
  now: () => number
  /** Present only when the in-memory mock API is in use. */
  mock: MockBackend | null
  /** Human-readable description of where API calls go. */
  apiTarget: string
}

export interface RuntimeOptions {
  env?: Env
  /** Simulated network latency for the mock API, in ms. */
  latencyMs?: number
  /** Start already signed in (stub auth only). */
  signedIn?: boolean
  /** Use this in-memory backend instead of a fresh one (tests prepare state through it). */
  mock?: MockBackend
}

const str = (value: string | boolean | undefined): string | undefined =>
  typeof value === 'string' && value.trim() !== '' ? value.trim() : undefined

/**
 * Wires the app. Demo mode (in-memory mock API + stub auth) is the default when there is no
 * Firebase config, or when VITE_USE_MOCK=true; otherwise real Firebase and the real service.
 */
export function createRuntime(options: RuntimeOptions = {}): Runtime {
  const env: Env = options.env ?? import.meta.env
  const { latencyMs = 0, signedIn = false } = options
  const firebase = isFirebaseConfigured(env)
  let authMode: AuthMode = 'stub'
  let authClient: AuthClient
  let stub: StubAuthClient | null = null
  if (firebase) {
    const config = getFirebaseConfigFromEnv(env)
    authClient = createFirebaseAuthClient(config)
    authMode = config.authEmulatorHost ? 'emulator' : 'firebase'
  } else {
    stub = createStubAuthClient({
      latencyMs: latencyMs > 0 ? 150 : 0,
      ...(signedIn ? { initialUser: DEMO_USER } : {}),
    })
    authClient = stub
  }

  const useMock = env.VITE_USE_MOCK === 'true' || !firebase
  const mock = useMock ? (options.mock ?? new MockBackend()) : null
  const mockFetch: typeof fetch | undefined = mock
    ? async (input, init) => {
        if (latencyMs > 0) await new Promise((resolve) => setTimeout(resolve, latencyMs))
        return mock.fetch(input, init)
      }
    : undefined
  const baseUrl = str(env.VITE_API_BASE_URL) ?? '/api'

  const ownerClient = createApiClient({
    baseUrl,
    getToken: (forceRefresh) => authClient.getIdToken(forceRefresh),
    ...(mockFetch ? { fetch: mockFetch } : {}),
    onUnauthorized: () => void authClient.signOut(),
  })

  return {
    authMode,
    authClient,
    stub,
    ownerClient,
    createTrusteeClient: (token) =>
      createTrusteeClient({ baseUrl, token, ...(mockFetch ? { fetch: mockFetch } : {}) }),
    now: () => (mock ? mock.now() : Date.now()),
    mock,
    apiTarget: mock ? 'in-memory mock API' : baseUrl,
  }
}
