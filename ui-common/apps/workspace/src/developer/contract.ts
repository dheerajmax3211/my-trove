/**
 * The developer platform's HTTP contract as the console uses it (platform-service/README.md). Paths are relative to the
 * gateway root (`${apiBase}`), so `/platform/v1/...` is `/api/platform/v1/...`. The demo API answers the same shapes.
 */

export const DEVELOPER_PATH = '/platform/v1/developer'

export interface DeveloperApp {
  id: string
  clientId: string
  name: string
  description: string
  redirectUris: string[]
  hasClientSecret: boolean
  secretRotatedAt: string | null
  createdAt: string
  updatedAt: string
  /** Set when the app was deleted (revoked). Its keys stop verifying. */
  revokedAt: string | null
}

/** Returned once, by create. */
export interface CreatedApp {
  id: string
  clientId: string
  clientSecret: string
  name: string
  description: string
  redirectUris: string[]
  createdAt: string
}

/** Returned once, by secret rotation. */
export interface RotatedSecret {
  id: string
  clientId: string
  clientSecret: string
  rotatedAt: string
}

export interface ApiKey {
  id: string
  appId: string
  name: string
  keyPrefix: string
  scopes: string[]
  createdAt: string
  lastUsedAt: string | null
  expiresAt: string | null
  revokedAt: string | null
}

/** Returned once, by issue. `key` is the only copy the platform will ever show. */
export interface IssuedKey {
  id: string
  appId: string
  name: string
  keyPrefix: string
  key: string
  scopes: string[]
  createdAt: string
  expiresAt: string | null
}

export interface Scope {
  name: string
  description: string
  permissions: string[]
}

export interface EventType {
  name: string
  description: string
}

export interface WebhookEndpoint {
  id: string
  appId: string
  url: string
  description: string
  eventTypes: string[]
  createdAt: string
  disabledAt: string | null
}

/** Returned once, by create. */
export interface CreatedWebhook extends WebhookEndpoint {
  secret: string
}

export type DeliveryStatus = 'PENDING' | 'DELIVERED' | 'DEAD'

export interface Delivery {
  id: string
  endpointId: string
  eventId: string
  eventType: string
  /** One of DeliveryStatus today; a string so a new state from the platform does not break the log. */
  status: string
  attempts: number
  nextAttemptAt: string | null
  lastStatusCode: number | null
  lastError: string | null
  createdAt: string
  deliveredAt: string | null
  replayOf: string | null
}

/** One row of `GET /platform/v1/docs`. */
export interface DocsService {
  name: string
  available: boolean
  docsPath: string
}

export interface DocsIndex {
  services: DocsService[]
}

/** One consent grant as the owner sees it (`GET /consent/v1/owner/grants`). */
export interface ConnectedGrant {
  id: string
  clientId: string
  clientName: string
  scopes: string[]
  purpose: string | null
  maxSensitivity: string | null
  createdAt: string
  expiresAt: string
  maxReads: number | null
  readsUsed: number
  revokedAt: string | null
  lastReadAt: string | null
  /** ACTIVE, EXPIRED or REVOKED today. */
  status: string
}

/** Every key and endpoint path in one place, so screens and the demo agree. */
export const paths = {
  apps: `${DEVELOPER_PATH}/apps`,
  app: (id: string) => `${DEVELOPER_PATH}/apps/${id}`,
  rotateSecret: (id: string) => `${DEVELOPER_PATH}/apps/${id}/client-secret/rotate`,
  revokeSecret: (id: string) => `${DEVELOPER_PATH}/apps/${id}/client-secret/revoke`,
  appKeys: (appId: string) => `${DEVELOPER_PATH}/apps/${appId}/keys`,
  key: (keyId: string) => `${DEVELOPER_PATH}/keys/${keyId}`,
  scopes: `${DEVELOPER_PATH}/scopes`,
  eventTypes: `${DEVELOPER_PATH}/webhook-events`,
  appWebhooks: (appId: string) => `${DEVELOPER_PATH}/apps/${appId}/webhooks`,
  webhook: (id: string) => `${DEVELOPER_PATH}/webhooks/${id}`,
  rotateWebhookSecret: (id: string) => `${DEVELOPER_PATH}/webhooks/${id}/secret/rotate`,
  deliveries: (id: string) => `${DEVELOPER_PATH}/webhooks/${id}/deliveries`,
  replay: (id: string, deliveryId: string) =>
    `${DEVELOPER_PATH}/webhooks/${id}/deliveries/${deliveryId}/replay`,
  docs: '/platform/v1/docs',
  usage: '/platform/v1/usage/me',
  grants: '/consent/v1/owner/grants',
  revokeGrant: (id: string) => `/consent/v1/owner/grants/${id}/revoke`,
} as const
