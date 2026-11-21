import {
  QueryClient,
  QueryClientProvider,
  queryOptions,
  useMutation,
  useQuery,
  useQueryClient,
  type QueryKey,
  type UseMutationOptions,
  type UseMutationResult,
  type UseQueryOptions,
  type UseQueryResult,
} from '@tanstack/react-query'
import { createContext, useContext, useState, type ReactNode } from 'react'
import type { ApiClient, HttpMethod, QueryParams } from './client'
import { isApiError, type ApiError } from './errors'

/**
 * QueryClient with API-aware defaults: 4xx responses are not retried (they will not get better),
 * network failures and 5xx are retried twice, window-focus refetching is off.
 */
export function createApiQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 30_000,
        refetchOnWindowFocus: false,
        retry: (failureCount, error) =>
          failureCount < 2 && !(isApiError(error) && error.isClientError),
      },
      mutations: { retry: false },
    },
  })
}

const ApiClientContext = createContext<ApiClient | null>(null)

export interface ApiProviderProps {
  client: ApiClient
  /** Bring your own QueryClient (e.g. shared with other code). Default: `createApiQueryClient()`. */
  queryClient?: QueryClient
  children: ReactNode
}

/** Provides the ApiClient and a TanStack QueryClient to the tree. */
export function ApiProvider({ client, queryClient, children }: ApiProviderProps) {
  const [owned] = useState(() => queryClient ?? createApiQueryClient())
  return (
    <ApiClientContext value={client}>
      <QueryClientProvider client={queryClient ?? owned}>{children}</QueryClientProvider>
    </ApiClientContext>
  )
}

export function useApiClient(): ApiClient {
  const client = useContext(ApiClientContext)
  if (!client) throw new Error('useApiClient must be used within <ApiProvider>')
  return client
}

/** Stable cache key for a GET: `[path, query]`. Use it to invalidate or prefetch. */
export function apiQueryKey(path: string, query?: QueryParams): QueryKey {
  return query ? [path, query] : [path]
}

/** `queryOptions` for a GET, usable with `useQuery`, `prefetchQuery`, router loaders... */
export function apiQueryOptions<TData>(client: ApiClient, path: string, query?: QueryParams) {
  return queryOptions({
    queryKey: apiQueryKey(path, query),
    queryFn: ({ signal }) => client.get<TData>(path, { ...(query ? { query } : {}), signal }),
  })
}

export type UseApiQueryOptions<TData, TSelected = TData> = {
  query?: QueryParams
  /** Override the default `[path, query]` key. */
  queryKey?: QueryKey
} & Omit<UseQueryOptions<TData, ApiError, TSelected, QueryKey>, 'queryKey' | 'queryFn'>

/** GET `path` with caching, cancellation (AbortSignal) and an `ApiError`-typed `error`. */
export function useApiQuery<TData, TSelected = TData>(
  path: string,
  { query, queryKey, ...options }: UseApiQueryOptions<TData, TSelected> = {},
): UseQueryResult<TSelected, ApiError> {
  const client = useApiClient()
  return useQuery<TData, ApiError, TSelected, QueryKey>({
    ...options,
    queryKey: queryKey ?? apiQueryKey(path, query),
    queryFn: ({ signal }) => client.get<TData>(path, { ...(query ? { query } : {}), signal }),
  })
}

export type UseApiMutationOptions<TData, TVariables> = {
  method?: Exclude<HttpMethod, 'GET'>
  /** Path, or a function of the variables (e.g. `(v) => `/items/${v.id}``). */
  path: string | ((variables: TVariables) => string)
  /** Request body from the variables. Default: the variables themselves. */
  body?: (variables: TVariables) => unknown
  /** Query keys to invalidate after success (prefix match). */
  invalidate?: readonly QueryKey[]
} & Omit<UseMutationOptions<TData, ApiError, TVariables>, 'mutationFn'>

/** POST/PUT/PATCH/DELETE with optional automatic cache invalidation. */
export function useApiMutation<TData = unknown, TVariables = void>({
  method = 'POST',
  path,
  body,
  invalidate,
  onSuccess,
  ...options
}: UseApiMutationOptions<TData, TVariables>): UseMutationResult<TData, ApiError, TVariables> {
  const client = useApiClient()
  const queryClient = useQueryClient()
  return useMutation<TData, ApiError, TVariables>({
    ...options,
    mutationFn: (variables) =>
      client.request<TData>(typeof path === 'function' ? path(variables) : path, {
        method,
        ...(method === 'DELETE' ? {} : { body: body ? body(variables) : variables }),
      }),
    onSuccess: async (data, variables, onMutateResult, context) => {
      await Promise.all(
        (invalidate ?? []).map((queryKey) => queryClient.invalidateQueries({ queryKey })),
      )
      return onSuccess?.(data, variables, onMutateResult, context)
    },
  })
}
