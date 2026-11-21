import {
  createApiClient,
  createApiQueryClient,
  errorFromResponse,
  type ApiClient,
} from '@platform/api-client'
import {
  createFirebaseAuthClient,
  getFirebaseConfigFromEnv,
  isFirebaseConfigured,
  type AuthClient,
} from '@platform/auth-web'
import type { QueryClient } from '@tanstack/react-query'
import { resolveLauncherApps, type ResolvedApp } from '../config/apps'
import { createMockBackend } from '../mock/backend'
import { DEMO_USERS, type DemoUserSeed, type SeedKind } from '../mock/seed'
import { createDemoAuthClient } from './demoAuth'

export type HubMode = 'demo' | 'live'
type Env = Record<string, string | boolean | undefined>

export interface DemoControls {
  users: readonly DemoUserSeed[]
  signInAs: (uid: string) => Promise<void>
  /** Moves the mock backend's clock forward; due reminders fire. */
  advanceClock: (ms: number) => void
}

export interface HubRuntime {
  mode: HubMode
  authClient: AuthClient
  /** Bound to `<gateway>/auth`. Standalone only: the session call, profile and the admin screens. */
  authApi: ApiClient
  /** Bound to `<gateway>/shared`: what the Household module talks through (paths start at `/v1`). */
  sharedApi: ApiClient
  /** Root of the API gateway (`/api` by default). */
  apiBaseUrl: string
  /** Present in demo mode only. */
  demo: DemoControls | null
  apps: ResolvedApp[]
  /** The app's clock: the mock backend's clock in demo mode, the real one otherwise. */
  now: () => number
  /** A fresh query cache; the hub makes one per signed-in user so data never leaks between users. */
  createQueryClient: () => QueryClient
  /** Turns a shared-service path from a download link into a full URL. */
  downloadUrl: (sharedPath: string) => string
  /** Saves the file behind a signed download URL. */
  saveDownload: (url: string, fileName: string) => Promise<void>
}

export interface CreateRuntimeOptions {
  env?: Env
  /** Demo mode only. */
  latencyMs?: number
  now?: () => number
  seed?: SeedKind
  /** Demo mode only: start signed in as this user (tests). */
  initialUid?: string
  /** Retry failed queries (default true; tests turn it off). */
  retryQueries?: boolean
  /** Demo mode only: wrap the mock fetch, e.g. to record requests in tests. */
  instrumentFetch?: (inner: typeof fetch) => typeof fetch
}

function triggerDownload(href: string, fileName: string): void {
  const link = document.createElement('a')
  link.href = href
  link.download = fileName
  link.rel = 'noopener'
  document.body.append(link)
  link.click()
  link.remove()
}

/** `VITE_AUTH_EMULATOR_HOST` is accepted as a short alias of the auth-web variable. */
function normalizeEnv(env: Env): Env {
  const alias = env.VITE_AUTH_EMULATOR_HOST
  return alias && !env.VITE_FIREBASE_AUTH_EMULATOR_HOST
    ? { ...env, VITE_FIREBASE_AUTH_EMULATOR_HOST: alias }
    : env
}

/**
 * Wires the hub. Demo mode (the default without Firebase config, or with `VITE_USE_MOCK=true`)
 * uses switchable demo users and an in-memory backend; live mode uses Firebase and the real services.
 */
export function createRuntime(options: CreateRuntimeOptions = {}): HubRuntime {
  const env = normalizeEnv(options.env ?? import.meta.env)
  const demoMode = env.VITE_USE_MOCK === 'true' || !isFirebaseConfigured(env)
  const configuredBase =
    typeof env.VITE_API_BASE_URL === 'string' ? env.VITE_API_BASE_URL.trim() : ''
  const apiBaseUrl = (configuredBase || '/api').replace(/\/+$/, '')
  const apps = resolveLauncherApps(env)
  const retry = options.retryQueries ?? true
  const createQueryClient = () => {
    const client = createApiQueryClient()
    if (!retry)
      client.setDefaultOptions({
        ...client.getDefaultOptions(),
        queries: { ...client.getDefaultOptions().queries, retry: false },
      })
    return client
  }

  if (demoMode) {
    const latencyMs = options.latencyMs ?? 200
    const backend = createMockBackend({
      latencyMs,
      ...(options.now ? { now: options.now } : {}),
      ...(options.seed ? { seed: options.seed } : {}),
    })
    const mockFetch = options.instrumentFetch?.(backend.fetch) ?? backend.fetch
    const auth = createDemoAuthClient({
      users: DEMO_USERS,
      initialUid: options.initialUid ?? null,
      latencyMs: Math.min(latencyMs, 120),
    })
    return {
      mode: 'demo',
      authClient: auth,
      authApi: createApiClient({
        baseUrl: `${apiBaseUrl}/auth`,
        getToken: () => auth.getIdToken(),
        fetch: mockFetch,
        onUnauthorized: () => void auth.signOut(),
      }),
      sharedApi: createApiClient({
        baseUrl: `${apiBaseUrl}/shared`,
        getToken: () => auth.getIdToken(),
        fetch: mockFetch,
        onUnauthorized: () => void auth.signOut(),
      }),
      apiBaseUrl,
      demo: { users: DEMO_USERS, signInAs: auth.signInAs, advanceClock: backend.advanceClock },
      apps,
      now: backend.now,
      createQueryClient,
      downloadUrl: (path) => `${apiBaseUrl}/shared${path}`,
      saveDownload: async (url, fileName) => {
        const response = await mockFetch(url)
        if (!response.ok) throw await errorFromResponse(response)
        const objectUrl = URL.createObjectURL(await response.blob())
        try {
          triggerDownload(objectUrl, fileName)
        } finally {
          URL.revokeObjectURL(objectUrl)
        }
      },
    }
  }

  const auth = createFirebaseAuthClient(getFirebaseConfigFromEnv(env))
  return {
    mode: 'live',
    authClient: auth,
    authApi: createApiClient({
      baseUrl: `${apiBaseUrl}/auth`,
      getToken: (forceRefresh) => auth.getIdToken(forceRefresh),
      onUnauthorized: () => void auth.signOut(),
    }),
    sharedApi: createApiClient({
      baseUrl: `${apiBaseUrl}/shared`,
      getToken: (forceRefresh) => auth.getIdToken(forceRefresh),
      onUnauthorized: () => void auth.signOut(),
    }),
    apiBaseUrl,
    demo: null,
    apps,
    now: () => Date.now(),
    createQueryClient,
    downloadUrl: (path) => `${apiBaseUrl}/shared${path}`,
    // The link is a capability URL: the browser can fetch it directly, no bearer header needed.
    saveDownload: (url, fileName) => {
      triggerDownload(url, fileName)
      return Promise.resolve()
    },
  }
}
