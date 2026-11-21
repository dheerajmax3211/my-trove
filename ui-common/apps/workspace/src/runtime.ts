import {
  DEMO_USER,
  createFirebaseAuthClient,
  createStubAuthClient,
  getFirebaseConfigFromEnv,
  isFirebaseConfigured,
  type AuthClient,
} from '@platform/auth-web'
import type { Persona } from '@platform/ui'
import type { ProductModule } from '@platform/workspace-kit'
import { createWorkspaceDemoFetch, notFoundDemoFetch } from './demo/workspaceDemo'
import { isPersona } from './lib/personas'
import { browserStorages, readItem, writeItem, type Storages } from './lib/storage'

type Env = Record<string, string | boolean | undefined>

export const DEMO_FLAG_KEY = 'pp.workspace.demo'
export const DEMO_PERSONA_KEY = 'pp.workspace.demo.persona'
export const DEFAULT_API_BASE = 'http://localhost:8080/api'
export const DEFAULT_SITE_URL = 'http://localhost:5191'

/** What the account menu drives in demo mode. */
export interface DemoControls {
  persona: () => Persona
  setPersona: (persona: Persona) => void
  subscribe: (listener: () => void) => () => void
  /** True when the visitor asked for demo (`?demo=1`); false when the build simply has no sign-in configured. */
  explicit: boolean
}

export interface Runtime {
  mode: 'demo' | 'live'
  /** Present in demo mode only. */
  demo: DemoControls | null
  authClient: AuthClient
  /** The gateway root, e.g. `http://localhost:8080/api`. Every service lives at `${apiBase}/<service>`. */
  apiBase: string
  /** The public site, linked from the sign-in page. */
  siteUrl: string
  storage: Storages
  now: () => Date
  /** Retry failed queries (default true; tests turn it off). */
  retryQueries: boolean
  /** Transport for the workspace's own calls (`/auth/v1/me`, usage). `undefined` means the global fetch. */
  workspaceFetch: typeof fetch | undefined
  /**
   * Transport for one product module. In demo mode this is the module's own mock API, or a fetch
   * that answers 404 problem bodies; either way demo mode never touches the network.
   */
  moduleFetch: (module: ProductModule) => typeof fetch | undefined
  /** Forget the demo flag so the next load is a normal one. */
  leaveDemo: () => void
}

export interface RuntimeOptions {
  /** The URL's query string. Default: `window.location.search`. */
  search?: string
  storage?: Storages
  now?: () => Date
  /** Replace the auth client (tests). */
  authClient?: AuthClient
  /** Live mode: the transport for every request (tests). Default: the global fetch. */
  fetch?: typeof fetch
  retryQueries?: boolean
}

const str = (value: string | boolean | undefined): string | undefined =>
  typeof value === 'string' && value.trim() !== '' ? value.trim() : undefined

const trimSlash = (value: string) => value.replace(/\/+$/, '')

/**
 * Demo mode is on when the URL carries `?demo=1` (remembered for the tab), or when the build has no
 * sign-in configured at all. It uses a stub identity and each module's in-memory mock API, so it can
 * never reach real data; with a real identity provider configured and no `?demo=1`, it is off.
 */
export function createRuntime(env: Env = import.meta.env, options: RuntimeOptions = {}): Runtime {
  const storage = options.storage ?? browserStorages()
  const now = options.now ?? (() => new Date())
  const search = options.search ?? (typeof window === 'undefined' ? '' : window.location.search)

  if (new URLSearchParams(search).get('demo') === '1')
    writeItem(storage.session, DEMO_FLAG_KEY, '1')
  const explicit = readItem(storage.session, DEMO_FLAG_KEY) === '1'
  const demo = explicit || !isFirebaseConfigured(env)

  const apiBase = trimSlash(str(env.VITE_API_BASE_URL) ?? DEFAULT_API_BASE)
  const siteUrl = trimSlash(str(env.VITE_SITE_URL) ?? DEFAULT_SITE_URL)
  const retryQueries = options.retryQueries ?? true
  const leaveDemo = () => writeItem(storage.session, DEMO_FLAG_KEY, null)

  if (!demo) {
    const authClient = options.authClient ?? createFirebaseAuthClient(getFirebaseConfigFromEnv(env))
    return {
      mode: 'live',
      demo: null,
      authClient,
      apiBase,
      siteUrl,
      storage,
      now,
      retryQueries,
      workspaceFetch: options.fetch,
      moduleFetch: () => options.fetch,
      leaveDemo,
    }
  }

  let persona: Persona = (() => {
    const saved = readItem(storage.session, DEMO_PERSONA_KEY)
    return isPersona(saved) ? saved : 'OWNER'
  })()
  const listeners = new Set<() => void>()
  const controls: DemoControls = {
    persona: () => persona,
    setPersona: (next) => {
      persona = next
      writeItem(storage.session, DEMO_PERSONA_KEY, next)
      listeners.forEach((listener) => listener())
    },
    subscribe: (listener) => {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
    explicit,
  }

  const authClient =
    options.authClient ??
    createStubAuthClient({ initialUser: explicit ? DEMO_USER : null, user: DEMO_USER })

  // One mock backend per module for the life of the runtime, so edits survive navigating around.
  const moduleFetches = new Map<string, typeof fetch>()
  return {
    mode: 'demo',
    demo: controls,
    authClient,
    apiBase,
    siteUrl,
    storage,
    now,
    retryQueries,
    workspaceFetch: createWorkspaceDemoFetch({ persona: controls.persona, now }),
    moduleFetch: (module) => {
      let demoFetch = moduleFetches.get(module.id)
      if (!demoFetch) {
        demoFetch = module.createDemoFetch?.() ?? notFoundDemoFetch
        moduleFetches.set(module.id, demoFetch)
      }
      return demoFetch
    },
    leaveDemo,
  }
}
