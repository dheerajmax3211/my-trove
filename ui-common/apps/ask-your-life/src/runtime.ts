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
import { createMockApi, type MockApi, type MockApiOptions } from './mock/mockApi'

type Env = Record<string, string | boolean | undefined>

export interface Runtime {
  /** `demo`: stub sign-in and an in-memory API. `live`: Firebase and the real service. */
  mode: 'demo' | 'live'
  authClient: AuthClient
  /** Present only in demo mode. */
  stub: StubAuthClient | null
  apiClient: ApiClient
  /** Present only in demo mode. */
  mock: MockApi | null
  /** Where API calls go, for display. */
  apiTarget: string
}

export interface DemoRuntimeOptions {
  mock?: MockApiOptions
  /** Wrap the mock's fetch, e.g. to force a failure or return custom data. */
  wrapFetch?: (mockFetch: typeof fetch) => typeof fetch
  /** Start signed in. Default true, so the demo opens straight onto the app. */
  signedIn?: boolean
}

export function createDemoRuntime(options: DemoRuntimeOptions = {}): Runtime {
  const stub = createStubAuthClient({
    initialUser: options.signedIn === false ? null : DEMO_USER,
    latencyMs: options.mock?.latencyMs === 0 ? 0 : 100,
  })
  const mock = createMockApi(options.mock)
  const fetchImpl = options.wrapFetch ? options.wrapFetch(mock.fetch) : mock.fetch
  const apiClient = createApiClient({
    baseUrl: '/api',
    getToken: (force) => stub.getIdToken(force),
    fetch: fetchImpl,
    onUnauthorized: () => void stub.signOut(),
  })
  return { mode: 'demo', authClient: stub, stub, apiClient, mock, apiTarget: 'in-memory mock API' }
}

function createLiveRuntime(env: Env): Runtime {
  const authClient = createFirebaseAuthClient(getFirebaseConfigFromEnv(env))
  const baseUrl =
    typeof env.VITE_API_BASE_URL === 'string' && env.VITE_API_BASE_URL
      ? env.VITE_API_BASE_URL
      : '/api'
  const apiClient = createApiClient({
    baseUrl,
    getToken: (force) => authClient.getIdToken(force),
    onUnauthorized: () => void authClient.signOut(),
  })
  return { mode: 'live', authClient, stub: null, apiClient, mock: null, apiTarget: baseUrl }
}

/**
 * Demo mode is the default: it is used whenever `VITE_USE_MOCK=true`, or Firebase is not
 * configured. Otherwise the app signs in with Firebase and talks to the real service.
 */
export function createRuntime(env: Env = import.meta.env): Runtime {
  const forceMock = env.VITE_USE_MOCK === 'true' || env.VITE_USE_MOCK === true
  return forceMock || !isFirebaseConfigured(env) ? createDemoRuntime() : createLiveRuntime(env)
}
