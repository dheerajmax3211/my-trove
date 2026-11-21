import { useApiMutation, useApiQuery } from '@platform/api-client'
import { afterClientChange, paths } from '../../../shared/api/paths'
import type { Client, ClientWithSecret, RegisterClientBody } from '../../../shared/api/types'

export function useClients() {
  return useApiQuery<Client[]>(paths.clients)
}

/** The response carries the only copy of the secret: consume it, then call `reset()`. */
export function useRegisterClient() {
  return useApiMutation<ClientWithSecret, RegisterClientBody>({
    path: paths.clients,
    gcTime: 0, // do not keep the response (it holds the secret) in the mutation cache
    invalidate: afterClientChange,
  })
}

/** Variable: the client id. */
export function useRotateSecret() {
  return useApiMutation<ClientWithSecret, string>({
    path: (clientId) => paths.rotateSecret(clientId),
    gcTime: 0, // do not keep the response (it holds the secret) in the mutation cache
    body: () => undefined,
    invalidate: afterClientChange,
  })
}

/** Variable: the client id. Also revokes every grant of the client. */
export function useDisableClient() {
  return useApiMutation<void, string>({
    method: 'DELETE',
    path: (clientId) => paths.client(clientId),
    invalidate: afterClientChange,
  })
}
