import {
  type ApiError,
  isApiError,
  useApiClient,
  useApiQuery,
  type ApiClient,
  type QueryParams,
  type UseApiQueryOptions,
} from '@platform/api-client'
import { useQuery, useQueries, type UseQueryResult } from '@tanstack/react-query'
import { createContext, useContext, useMemo, type ReactNode } from 'react'
import { useWorkspaceSession } from '@platform/workspace-kit'
import { PERMISSIONS } from './catalogue'
import { chunk, isUuid, shortId } from './format'
import type { Identity } from './types'

/**
 * The module's own client is bound to `<gateway>/api/auth`. The platform service lives at the sibling
 * `<gateway>/api/platform`. `ApiClient` does not expose its base URL, so a path that starts with `../platform/`
 * is resolved against the base by the URL parser (`/api/auth/../platform/v1/x` is `/api/platform/v1/x`) before
 * the request leaves the browser. The same client (token, 401 refresh, error mapping) is reused, so there is
 * nothing to configure. A host that prefers an explicit client can supply one with `PlatformApiProvider`.
 */
export function siblingClient(client: ApiClient, service: string): ApiClient {
  const rewrite = (path: string) =>
    /^[a-z][a-z\d+.-]*:\/\//i.test(path) ? path : `../${service}/${path.replace(/^\/+/, '')}`
  return {
    request: (path, options) => client.request(rewrite(path), options),
    get: (path, options) => client.get(rewrite(path), options),
    post: (path, body, options) => client.post(rewrite(path), body, options),
    put: (path, body, options) => client.put(rewrite(path), body, options),
    patch: (path, body, options) => client.patch(rewrite(path), body, options),
    delete: (path, options) => client.delete(rewrite(path), options),
  }
}

const PlatformClientContext = createContext<ApiClient | null>(null)

/** Optional override: give the console an explicit client for `<gateway>/api/platform`. */
export function PlatformApiProvider({
  client,
  children,
}: {
  client: ApiClient
  children: ReactNode
}) {
  return <PlatformClientContext value={client}>{children}</PlatformClientContext>
}

export function usePlatformClient(): ApiClient {
  const override = useContext(PlatformClientContext)
  const auth = useApiClient()
  return useMemo(() => override ?? siblingClient(auth, 'platform'), [override, auth])
}

/** GET on the auth service (the module's own client). Keys are `[path, query]`. */
export function useAuthQuery<T>(
  path: string,
  query?: QueryParams,
  options: UseApiQueryOptions<T> = {},
): UseQueryResult<T, ApiError> {
  return useApiQuery<T>(path, { ...(query ? { query } : {}), ...options })
}

/** GET on the platform service. Keys are `['platform', path, query]`, apart from every auth key. */
export function usePlatformQuery<T>(
  path: string,
  query?: QueryParams,
  options: { enabled?: boolean; refetchInterval?: number | false } = {},
): UseQueryResult<T, ApiError> {
  const client = usePlatformClient()
  return useQuery<T, ApiError>({
    queryKey: ['platform', path, query ?? null],
    queryFn: ({ signal }) => client.get<T>(path, { ...(query ? { query } : {}), signal }),
    ...options,
  })
}

/** The message a person should read: the server's own detail for a problem document. */
export function errorMessage(error: unknown): string {
  if (isApiError(error)) return error.detail ?? error.title
  return error instanceof Error ? error.message : 'Something went wrong.'
}

export const MAX_LOOKUP_IDS = 100

export interface NameLookup {
  /** Display name, else email, else "Unknown user (abcd1234)". */
  nameOf: (id: string | null | undefined) => string
  identityOf: (id: string | null | undefined) => Identity | undefined
  loading: boolean
}

/**
 * Resolve user ids to names with `GET /v1/admin/users/lookup?ids=a,b,c`: duplicates and non-UUIDs are dropped, ids
 * are sent in batches of at most 100 and each batch is cached, so a screen costs one call per 100 distinct people.
 */
export function useNames(ids: readonly (string | null | undefined)[]): NameLookup {
  const client = useApiClient()
  const { can } = useWorkspaceSession()
  const allowed = can(PERMISSIONS.usersRead)
  const key = useMemo(
    () => [...new Set(ids.filter((id): id is string => !!id && isUuid(id)))].sort().join(','),
    [ids],
  )
  const batches = useMemo(() => (key ? chunk(key.split(','), MAX_LOOKUP_IDS) : []), [key])

  const results = useQueries({
    queries: batches.map((batch) => ({
      queryKey: ['admin-lookup', batch.join(',')],
      queryFn: ({ signal }: { signal: AbortSignal }) =>
        client.get<Identity[]>('/v1/admin/users/lookup', {
          query: { ids: batch.join(',') },
          signal,
        }),
      enabled: allowed,
      staleTime: 5 * 60_000,
      retry: false,
    })),
  })

  const identities = new Map<string, Identity>()
  for (const result of results)
    for (const identity of result.data ?? []) identities.set(identity.id, identity)
  const loading = allowed && results.some((r) => r.isPending)

  return {
    identityOf: (id) => (id ? identities.get(id) : undefined),
    nameOf: (id) => {
      if (!id) return 'System'
      const identity = identities.get(id)
      const name = identity?.displayName?.trim() || identity?.email?.trim()
      if (name) return name
      return loading ? 'Loading…' : `Unknown user (${shortId(id)})`
    },
    loading,
  }
}
