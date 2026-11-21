/** Every owner endpoint of the consent gateway, in one place. */
const OWNER = '/v1/owner'

export const paths = {
  attributes: `${OWNER}/vault/attributes`,
  attribute: (keyPath: string) => `${OWNER}/vault/attributes/${encodeURIComponent(keyPath)}`,
  clients: `${OWNER}/clients`,
  client: (clientId: string) => `${OWNER}/clients/${encodeURIComponent(clientId)}`,
  rotateSecret: (clientId: string) =>
    `${OWNER}/clients/${encodeURIComponent(clientId)}/rotate-secret`,
  requests: `${OWNER}/requests`,
  approve: (id: string) => `${OWNER}/requests/${encodeURIComponent(id)}/approve`,
  deny: (id: string) => `${OWNER}/requests/${encodeURIComponent(id)}/deny`,
  grants: `${OWNER}/grants`,
  revoke: (id: string) => `${OWNER}/grants/${encodeURIComponent(id)}/revoke`,
  accessLog: `${OWNER}/access-log`,
  verify: `${OWNER}/audit/verify`,
  dashboard: `${OWNER}/dashboard`,
} as const

/**
 * Query keys are the GET paths (see `apiQueryKey`). Invalidating by one of these prefixes
 * refreshes every variant (filters, pages) of that resource.
 */
export const invalidation = {
  attributes: [[paths.attributes]],
  clients: [[paths.clients]],
  requests: [[paths.requests]],
  grants: [[paths.grants]],
  dashboard: [[paths.dashboard]],
  audit: [[paths.accessLog], [paths.verify]],
} as const

/** What a decision changes everywhere: the inbox, grants, the dashboard counters and the audit trail. */
export const afterDecision = [
  ...invalidation.requests,
  ...invalidation.grants,
  ...invalidation.dashboard,
  ...invalidation.audit,
]
export const afterVaultChange = [
  ...invalidation.attributes,
  ...invalidation.dashboard,
  ...invalidation.audit,
]
export const afterClientChange = [
  ...invalidation.clients,
  ...invalidation.requests,
  ...invalidation.grants,
  ...invalidation.dashboard,
  ...invalidation.audit,
]
