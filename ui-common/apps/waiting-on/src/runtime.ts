import { createApiClient, createApiQueryClient, type ApiClient } from '@platform/api-client'
import {
  DEMO_USER,
  createFirebaseAuthClient,
  createStubAuthClient,
  getFirebaseConfigFromEnv,
  isFirebaseConfigured,
  type AuthClient,
} from '@platform/auth-web'
import type { QueryClient } from '@tanstack/react-query'
import { systemClock, type Clock } from './lib/clock'
import { createMockBackend } from './mock/backend'
import { demoSeed } from './mock/seed'

export interface Runtime {
  /** Demo mode: stub sign-in plus an in-memory mock API. Otherwise Firebase plus the real service. */
  demo: boolean
  authClient: AuthClient
  apiClient: ApiClient
  clock: Clock
  /** Override the default QueryClient (tests turn retries off). */
  queryClient?: QueryClient
}

type Env = Record<string, string | boolean | undefined>

/**
 * Demo mode is the default: it needs no Firebase project and no backend. Real mode starts when
 * Firebase is configured (and VITE_USE_MOCK is not "true").
 */
export function createRuntime(env: Env = import.meta.env, clock: Clock = systemClock): Runtime {
  const demo = env.VITE_USE_MOCK === 'true' || !isFirebaseConfigured(env)

  if (demo) {
    const authClient = createStubAuthClient({ initialUser: DEMO_USER, latencyMs: 120 })
    const backend = createMockBackend({ clock, latencyMs: 250, seed: demoSeed(clock()) })
    return {
      demo,
      authClient,
      clock,
      apiClient: createApiClient({
        baseUrl: '/api',
        getToken: (force) => authClient.getIdToken(force),
        fetch: backend.fetch,
        onUnauthorized: () => void authClient.signOut(),
      }),
      queryClient: createApiQueryClient(),
    }
  }

  const authClient = createFirebaseAuthClient(getFirebaseConfigFromEnv(env))
  const baseUrl =
    typeof env.VITE_API_BASE_URL === 'string' && env.VITE_API_BASE_URL
      ? env.VITE_API_BASE_URL
      : '/api'
  return {
    demo,
    authClient,
    clock,
    apiClient: createApiClient({
      baseUrl,
      getToken: (force) => authClient.getIdToken(force),
      onUnauthorized: () => void authClient.signOut(),
    }),
    queryClient: createApiQueryClient(),
  }
}
