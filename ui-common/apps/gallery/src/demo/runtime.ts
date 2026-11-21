import {
  createFirebaseAuthClient,
  createStubAuthClient,
  getFirebaseConfigFromEnv,
  isFirebaseConfigured,
  type AuthClient,
  type StubAuthClient,
} from '@platform/auth-web'
import { createApiClient, type ApiClient } from '@platform/api-client'
import { createMockFetch } from './mockApi'

export type AuthMode = 'emulator' | 'firebase' | 'stub'

export interface DemoRuntime {
  mode: AuthMode
  authClient: AuthClient
  /** Present only in stub mode. */
  stub: StubAuthClient | null
  apiClient: ApiClient
  /** Human-readable description of where API calls go. */
  apiTarget: string
}

/**
 * Wires the demo: real Firebase (or its emulator) when VITE_FIREBASE_* is set, otherwise an
 * in-memory stub; a real backend when VITE_API_BASE_URL is set, otherwise an in-memory mock API.
 */
export function createDemoRuntime(
  env: Record<string, string | boolean | undefined> = import.meta.env,
): DemoRuntime {
  let mode: AuthMode = 'stub'
  let authClient: AuthClient
  let stub: StubAuthClient | null = null

  if (isFirebaseConfigured(env)) {
    const config = getFirebaseConfigFromEnv(env)
    authClient = createFirebaseAuthClient(config)
    mode = config.authEmulatorHost ? 'emulator' : 'firebase'
  } else {
    stub = createStubAuthClient({ latencyMs: 150 })
    authClient = stub
  }

  const baseUrl =
    typeof env.VITE_API_BASE_URL === 'string' && env.VITE_API_BASE_URL
      ? env.VITE_API_BASE_URL
      : null
  const apiClient = createApiClient({
    baseUrl: baseUrl ?? '/api',
    getToken: (forceRefresh) => authClient.getIdToken(forceRefresh),
    ...(baseUrl ? {} : { fetch: createMockFetch() }),
    onUnauthorized: () => void authClient.signOut(),
  })

  return { mode, authClient, stub, apiClient, apiTarget: baseUrl ?? 'in-memory mock API' }
}
