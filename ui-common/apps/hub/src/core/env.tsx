import { errorFromResponse, useApiClient, type ApiClient } from '@platform/api-client'
import { useModuleBase, useWorkspaceSession } from '@platform/workspace-kit'
import { createContext, useContext, useMemo, type ReactNode } from 'react'
import { WORKSPACE_DEMO_USERS } from '../mock/seed'
import { getDemoTransport } from './demoTransport'

/**
 * What the Household pages need from whoever hosts them, and nothing more: a clock, a way to turn a signed
 * download link into a URL and save it, and names for the people the service only knows by uid.
 *
 * Inside the workspace `CoreProviders` supplies these, so the module works with no wiring beyond the
 * providers the workspace already gives every module. Tests provide their own (the mock clock, the demo cast).
 */
export interface CoreEnv {
  /** Epoch milliseconds. The mock backend's clock in tests, the real one otherwise. */
  now: () => number
  /** Turns the path in a signed link (`/v1/files/download?token=...`) into a URL the browser can open. */
  downloadUrl: (servicePath: string) => string
  /** Saves the file behind a signed URL. */
  saveDownload: (url: string, fileName: string) => Promise<void>
  /** Names for uids the host knows (the demo cast). Everyone else is shown as "Member abcd". */
  directory: Readonly<Record<string, string>>
}

const NO_DIRECTORY: Readonly<Record<string, string>> = Object.freeze({})

export function triggerDownload(href: string, fileName: string): void {
  const link = document.createElement('a')
  link.href = href
  link.download = fileName
  link.rel = 'noopener'
  document.body.append(link)
  link.click()
  link.remove()
}

/** Signed links are capability URLs: the browser can open them directly, no bearer header needed. */
export function saveByNavigation(url: string, fileName: string): Promise<void> {
  triggerDownload(url, fileName)
  return Promise.resolve()
}

/** Demo mode never touches the network: the bytes come from the in-memory backend. */
export async function saveFromTransport(
  transport: typeof fetch,
  url: string,
  fileName: string,
): Promise<void> {
  const response = await transport(url)
  if (!response.ok) throw await errorFromResponse(response)
  const objectUrl = URL.createObjectURL(await response.blob())
  try {
    triggerDownload(objectUrl, fileName)
  } finally {
    URL.revokeObjectURL(objectUrl)
  }
}

const trimSlash = (value: string) => value.replace(/\/+$/, '')

/** Used when the gateway root is not configured: a same-origin `/api` outside a module base, and the workspace's default gateway. */
export const STANDALONE_API_ROOT = '/api'
export const WORKSPACE_API_ROOT = 'http://localhost:8080/api'

/**
 * Where the shared service lives, as an absolute or origin-relative URL prefix.
 *
 * `ApiClient` does not expose the base URL it was built with (a request goes straight to `fetch`), so a
 * client that offers a `baseUrl` is believed and otherwise the base is rebuilt the way the host builds it:
 * `<VITE_API_BASE_URL>/<service>`.
 */
export function resolveServiceBase(
  client: ApiClient,
  inWorkspace: boolean,
  env: Record<string, unknown> = import.meta.env,
): string {
  const advertised = (client as { baseUrl?: unknown }).baseUrl
  if (typeof advertised === 'string' && advertised) return trimSlash(advertised)
  const configured = typeof env.VITE_API_BASE_URL === 'string' ? env.VITE_API_BASE_URL.trim() : ''
  const root = configured || (inWorkspace ? WORKSPACE_API_ROOT : STANDALONE_API_ROOT)
  return `${trimSlash(root)}/shared`
}

const CoreEnvContext = createContext<CoreEnv | null>(null)

export function CoreEnvProvider({ env, children }: { env: CoreEnv; children: ReactNode }) {
  return <CoreEnvContext value={env}>{children}</CoreEnvContext>
}

/**
 * The environment the pages run in. Without a provider (a test, a host that skipped `Providers`) it falls
 * back to the real clock, live downloads through the client's base and no names.
 */
export function useCoreEnv(): CoreEnv {
  const provided = useContext(CoreEnvContext)
  const client = useApiClient()
  const inWorkspace = useModuleBase() !== ''
  return useMemo(() => {
    if (provided) return provided
    const base = resolveServiceBase(client, inWorkspace)
    return {
      now: () => Date.now(),
      downloadUrl: (path) => `${base}${path}`,
      saveDownload: saveByNavigation,
      directory: NO_DIRECTORY,
    }
  }, [provided, client, inWorkspace])
}

const WORKSPACE_DEMO_DIRECTORY: Readonly<Record<string, string>> = Object.fromEntries(
  WORKSPACE_DEMO_USERS.map((u) => [u.uid, u.displayName]),
)

/**
 * The environment inside the workspace. In demo mode downloads are served by the module's own in-memory
 * backend (the workspace's demo mode must never make a network call).
 */
export function CoreProviders({ children }: { children: ReactNode }) {
  const client = useApiClient()
  const { isDemo } = useWorkspaceSession()
  const env = useMemo<CoreEnv>(() => {
    const base = resolveServiceBase(client, true)
    return {
      now: () => Date.now(),
      downloadUrl: (path) => `${base}${path}`,
      saveDownload: (url, fileName) => {
        const transport = isDemo ? getDemoTransport() : null
        return transport
          ? saveFromTransport(transport, url, fileName)
          : saveByNavigation(url, fileName)
      },
      directory: isDemo ? WORKSPACE_DEMO_DIRECTORY : NO_DIRECTORY,
    }
  }, [client, isDemo])
  return <CoreEnvProvider env={env}>{children}</CoreEnvProvider>
}
