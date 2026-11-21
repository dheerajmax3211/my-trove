import { createApiClient, type ApiClient } from '@platform/api-client'
import { createOwnerApi } from '../api/ownerApi'
import { createTrusteeApi, createTrusteeClient } from '../api/trusteeApi'
import { MockBackend } from '../mock/backend'

/** A mock server plus ready-made owner and trustee API clients, for service-level tests. */
export function createHarness(backend: MockBackend = new MockBackend()) {
  const ownerClient: ApiClient = createApiClient({
    baseUrl: '/api',
    getToken: () => 'stub-token-1',
    fetch: backend.fetch,
  })
  return {
    backend,
    ownerClient,
    owner: createOwnerApi(ownerClient),
    trusteeClient: (token: string | null) =>
      createTrusteeClient({ baseUrl: '/api', token, fetch: backend.fetch }),
    trusteeApi: (token: string | null) =>
      createTrusteeApi(createTrusteeClient({ baseUrl: '/api', token, fetch: backend.fetch })),
  }
}

/** The URL of any fetch input. */
export const urlOf = (input: RequestInfo | URL): string =>
  typeof input === 'string' ? input : input instanceof URL ? input.href : input.url

export const DAY_MS = 24 * 3600 * 1000
export const HOUR_MS = 3600 * 1000
