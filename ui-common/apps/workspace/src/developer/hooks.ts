import { apiQueryOptions, useApiClient, useApiQuery, type ApiError } from '@platform/api-client'
import { useMutation, useQueries, useQueryClient } from '@tanstack/react-query'
import {
  DEVELOPER_PATH,
  paths,
  type ApiKey,
  type CreatedApp,
  type CreatedWebhook,
  type Delivery,
  type DeveloperApp,
  type DocsIndex,
  type EventType,
  type RotatedSecret,
  type Scope,
  type WebhookEndpoint,
} from './contract'

/** The owner's apps, including revoked ones (they carry `revokedAt`). */
export function useDeveloperApps() {
  return useApiQuery<DeveloperApp[]>(paths.apps)
}

export function useDeveloperApp(id: string) {
  return useApiQuery<DeveloperApp>(paths.app(id))
}

export function useScopes() {
  return useApiQuery<Scope[]>(paths.scopes)
}

export function useEventTypes() {
  return useApiQuery<EventType[]>(paths.eventTypes)
}

export function useDocsIndex() {
  return useApiQuery<DocsIndex>(paths.docs)
}

/**
 * One query per app, merged by the caller. The platform lists keys and endpoints per app, so the overview and the
 * cross-app pages fan out with the same cache keys the app pages use.
 */
export function useKeysOfApps(apps: readonly DeveloperApp[]) {
  const client = useApiClient()
  const results = useQueries({
    queries: apps.map((app) => apiQueryOptions<ApiKey[]>(client, paths.appKeys(app.id))),
  })
  return {
    keys: results.flatMap((result) => result.data ?? []),
    pending: results.some((result) => result.isPending),
    error: results.find((result) => result.error)?.error,
  }
}

export function useWebhooksOfApps(apps: readonly DeveloperApp[]) {
  const client = useApiClient()
  const results = useQueries({
    queries: apps.map((app) =>
      apiQueryOptions<WebhookEndpoint[]>(client, paths.appWebhooks(app.id)),
    ),
  })
  return {
    webhooks: results.flatMap((result) => result.data ?? []),
    pending: results.some((result) => result.isPending),
    error: results.find((result) => result.error)?.error,
  }
}

export function useDeliveriesOf(webhooks: readonly WebhookEndpoint[]) {
  const client = useApiClient()
  const results = useQueries({
    queries: webhooks.map((hook) => apiQueryOptions<Delivery[]>(client, paths.deliveries(hook.id))),
  })
  return {
    deliveries: results.flatMap((result, index) =>
      (result.data ?? []).map((delivery) => ({ delivery, webhook: webhooks[index]! })),
    ),
    pending: results.some((result) => result.isPending),
  }
}

export interface DeveloperCall {
  method: 'POST' | 'PUT' | 'DELETE'
  path: string
  body?: unknown
}

function isDeveloperQuery(queryKey: readonly unknown[]): boolean {
  const first = queryKey[0]
  return typeof first === 'string' && first.startsWith(DEVELOPER_PATH)
}

/**
 * A write to the developer platform. Every developer query is refetched afterwards, so lists, counts and limits agree
 * with what was just changed.
 */
export function useDeveloperCall<TData, TVariables>(
  build: (variables: TVariables) => DeveloperCall,
) {
  const client = useApiClient()
  const queryClient = useQueryClient()
  return useMutation<TData, ApiError, TVariables>({
    mutationFn: (variables) => {
      const call = build(variables)
      return client.request<TData>(call.path, {
        method: call.method,
        ...(call.body !== undefined ? { body: call.body } : {}),
      })
    },
    onSuccess: () =>
      queryClient.invalidateQueries({ predicate: (query) => isDeveloperQuery(query.queryKey) }),
  })
}

export interface AppInput {
  name: string
  description: string
  redirectUris: string[]
}

export function useCreateApp() {
  return useDeveloperCall<CreatedApp, AppInput>((input) => ({
    method: 'POST',
    path: paths.apps,
    body: input,
  }))
}

export function useUpdateApp() {
  return useDeveloperCall<DeveloperApp, AppInput & { id: string }>(({ id, ...input }) => ({
    method: 'PUT',
    path: paths.app(id),
    body: input,
  }))
}

export function useRotateSecret() {
  return useDeveloperCall<RotatedSecret, { id: string }>(({ id }) => ({
    method: 'POST',
    path: paths.rotateSecret(id),
  }))
}

export function useRevokeSecret() {
  return useDeveloperCall<void, { id: string }>(({ id }) => ({
    method: 'POST',
    path: paths.revokeSecret(id),
  }))
}

export function useDeleteApp() {
  return useDeveloperCall<void, { id: string }>(({ id }) => ({
    method: 'DELETE',
    path: paths.app(id),
  }))
}

export interface KeyInput {
  name: string
  scopes: string[]
  expiresAt?: string
}

export interface IssueKeyResult {
  id: string
  appId: string
  name: string
  keyPrefix: string
  key: string
  scopes: string[]
  createdAt: string
  expiresAt: string | null
}

export function useIssueKey() {
  return useDeveloperCall<IssueKeyResult, KeyInput & { appId: string }>(({ appId, ...input }) => ({
    method: 'POST',
    path: paths.appKeys(appId),
    body: input,
  }))
}

export function useRevokeKey() {
  return useDeveloperCall<void, { keyId: string }>(({ keyId }) => ({
    method: 'DELETE',
    path: paths.key(keyId),
  }))
}

export interface WebhookInput {
  url: string
  description: string
  eventTypes: string[]
}

export function useCreateWebhook() {
  return useDeveloperCall<CreatedWebhook, WebhookInput & { appId: string }>(
    ({ appId, ...input }) => ({
      method: 'POST',
      path: paths.appWebhooks(appId),
      body: input,
    }),
  )
}

export function useDisableWebhook() {
  return useDeveloperCall<void, { id: string }>(({ id }) => ({
    method: 'DELETE',
    path: paths.webhook(id),
  }))
}

export function useRotateWebhookSecret() {
  return useDeveloperCall<{ id: string; secret: string; rotatedAt: string }, { id: string }>(
    ({ id }) => ({
      method: 'POST',
      path: paths.rotateWebhookSecret(id),
    }),
  )
}

export function useReplayDelivery() {
  return useDeveloperCall<Delivery, { webhookId: string; deliveryId: string }>(
    ({ webhookId, deliveryId }) => ({
      method: 'POST',
      path: paths.replay(webhookId, deliveryId),
    }),
  )
}
