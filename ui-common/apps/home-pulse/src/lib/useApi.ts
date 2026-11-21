import { useApiClient, type ApiClient } from '@platform/api-client'
import { useMemo } from 'react'

/** Binds one feature's endpoint functions to the app's API client. */
export function useApi<T>(factory: (client: ApiClient) => T): T {
  const client = useApiClient()
  // `factory` is always a module-level function (e.g. `appliancesApi`), so it is a stable dependency.
  return useMemo(() => factory(client), [client, factory])
}
