import { createApiClient, createApiQueryClient, type ApiClient } from '@platform/api-client'
import type { AuthClient } from '@platform/auth-web'
import type { QueryClient } from '@tanstack/react-query'
import type { ProductModule } from '@platform/workspace-kit'
import type { Runtime } from '../runtime'

/** One API client and one query cache: what a module (or the workspace itself) talks through. */
export interface ScopedRuntime {
  client: ApiClient
  queryClient: QueryClient
  /** The gateway URL this client is bound to. */
  baseUrl: string
}

export interface RuntimeStore {
  /** For the workspace's own calls: `/auth/v1/me`, usage. Bound to the gateway root. */
  workspace: ScopedRuntime
  /** For one module, bound to `${apiBase}/${module.service}`. Created on first use. */
  forModule: (module: ProductModule) => ScopedRuntime
  /** Empty every cache and forget every client (sign-out, user change). */
  clear: () => void
}

function newQueryClient(retry: boolean): QueryClient {
  const queryClient = createApiQueryClient()
  if (!retry) {
    queryClient.setDefaultOptions({
      ...queryClient.getDefaultOptions(),
      queries: { ...queryClient.getDefaultOptions().queries, retry: false },
    })
  }
  return queryClient
}

/**
 * Isolation rule: two modules never share an API client or a query cache, and the workspace's own
 * calls have a third pair. Keys like `/v1/items` therefore cannot collide across products, and a
 * product cannot read another product's cached data. Callers throw the whole store away when the
 * signed-in user changes.
 */
export function createRuntimeStore(runtime: Runtime, authClient: AuthClient): RuntimeStore {
  const scoped = new Map<string, ScopedRuntime>()

  const build = (baseUrl: string, fetchImpl: typeof fetch | undefined): ScopedRuntime => ({
    baseUrl,
    queryClient: newQueryClient(runtime.retryQueries),
    client: createApiClient({
      baseUrl,
      getToken: (force) => authClient.getIdToken(force),
      ...(fetchImpl ? { fetch: fetchImpl } : {}),
      onUnauthorized: () => void authClient.signOut(),
    }),
  })

  const workspace = build(runtime.apiBase, runtime.workspaceFetch)

  return {
    workspace,
    forModule(module) {
      let entry = scoped.get(module.id)
      if (!entry) {
        entry = build(`${runtime.apiBase}/${module.service}`, runtime.moduleFetch(module))
        scoped.set(module.id, entry)
      }
      return entry
    },
    clear() {
      workspace.queryClient.clear()
      for (const entry of scoped.values()) entry.queryClient.clear()
      scoped.clear()
    },
  }
}
