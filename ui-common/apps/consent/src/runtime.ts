import { createApiClient, createApiQueryClient, type ApiClient } from '@platform/api-client'
import {
  createFirebaseAuthClient,
  createStubAuthClient,
  DEMO_USER,
  getFirebaseConfigFromEnv,
  isFirebaseConfigured,
  type AuthClient,
} from '@platform/auth-web'
import type { QueryClient } from '@tanstack/react-query'
import { createMockBackend, type MockBackend } from './mock/backend'

export type AuthMode = 'emulator' | 'firebase' | 'stub'

export interface Runtime {
  /** Demo mode: stub sign-in plus the in-memory mock gateway. */
  demo: boolean
  authMode: AuthMode
  authClient: AuthClient
  apiClient: ApiClient
  queryClient: QueryClient
  /** Present only in demo mode. */
  backend: MockBackend | null
  /** Human-readable description of where API calls go. */
  apiTarget: string
}

export interface RuntimeOptions {
  /** Start already signed in (stub auth only). Used by tests. */
  signedIn?: boolean
  /** Simulated latency for stub auth and the mock gateway. */
  latencyMs?: number
  queryClient?: QueryClient
  backend?: MockBackend
}

type Env = Record<string, string | boolean | undefined>

/**
 * Demo mode is the default: it is used when `VITE_USE_MOCK=true` or whenever no Firebase config is
 * present, so the app runs with no setup. Otherwise the app signs in with Firebase (or its
 * emulator) and calls the real consent gateway at `VITE_API_BASE_URL` (default `/api`, proxied in dev).
 */
export function createRuntime(env: Env = import.meta.env, options: RuntimeOptions = {}): Runtime {
  const demo = env.VITE_USE_MOCK === 'true' || !isFirebaseConfigured(env)
  const queryClient = options.queryClient ?? createApiQueryClient()

  if (demo) {
    const authClient = createStubAuthClient({
      latencyMs: options.latencyMs ?? 120,
      ...(options.signedIn ? { initialUser: DEMO_USER } : {}),
    })
    const backend =
      options.backend ?? createMockBackend({ latencyMs: options.latencyMs ?? 220, seed: 'demo' })
    const apiClient = createApiClient({
      baseUrl: '/api',
      getToken: (force) => authClient.getIdToken(force),
      fetch: backend.fetch,
      onUnauthorized: () => void authClient.signOut(),
    })
    return {
      demo,
      authMode: 'stub',
      authClient,
      apiClient,
      queryClient,
      backend,
      apiTarget: 'in-memory mock gateway',
    }
  }

  const config = getFirebaseConfigFromEnv(env)
  const authClient = createFirebaseAuthClient(config)
  const baseUrl =
    typeof env.VITE_API_BASE_URL === 'string' && env.VITE_API_BASE_URL
      ? env.VITE_API_BASE_URL
      : '/api'
  const apiClient = createApiClient({
    baseUrl,
    getToken: (force) => authClient.getIdToken(force),
    onUnauthorized: () => void authClient.signOut(),
  })
  return {
    demo,
    authMode: config.authEmulatorHost ? 'emulator' : 'firebase',
    authClient,
    apiClient,
    queryClient,
    backend: null,
    apiTarget: baseUrl,
  }
}
