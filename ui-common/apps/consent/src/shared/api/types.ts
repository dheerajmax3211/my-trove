/** Wire types, mirroring the consent-gateway owner API records (ISO-8601 strings for Instants). */

export const SENSITIVITIES = ['PUBLIC', 'PERSONAL', 'SENSITIVE', 'RESTRICTED'] as const
export type Sensitivity = (typeof SENSITIVITIES)[number]

export interface AllowedHours {
  /** 0-23, inclusive. */
  startHour: number
  /** 0-24, exclusive. A start above the end wraps midnight. */
  endHour: number
  zone: string
}

export interface Attribute {
  keyPath: string
  value: unknown
  sensitivity: Sensitivity
  createdAt: string
  updatedAt: string
}

export interface CreateAttributeBody {
  keyPath: string
  value: unknown
  sensitivity: Sensitivity
}

export interface ReplaceAttributeBody {
  value: unknown
  sensitivity: Sensitivity
}

export interface Client {
  clientId: string
  name: string
  contactEmail: string | null
  redirectUri: string | null
  allowedScopes: string[]
  createdAt: string
  secretRotatedAt: string | null
  disabledAt: string | null
}

export interface RegisterClientBody {
  name: string
  contactEmail?: string
  allowedScopes: string[]
}

/** Returned once, at registration or rotation. The gateway keeps only a hash. */
export interface ClientWithSecret {
  client: Client
  clientSecret: string
}

export type RequestStatus = 'PENDING' | 'APPROVED' | 'DENIED' | 'EXPIRED'

export interface AccessRequest {
  id: string
  clientId: string
  clientName: string
  scopes: string[]
  purpose: string
  durationSeconds: number
  maxReads: number | null
  allowedHours: AllowedHours | null
  status: RequestStatus
  createdAt: string
  decidedAt: string | null
  decisionNote: string | null
  grantId: string | null
  /** When an undecided request expires on its own (the gateway's `request-ttl`); null once decided. */
  expiresAt: string | null
}

export interface ApproveBody {
  scopes?: string[]
  durationSeconds?: number
  maxReads?: number
  maxSensitivity?: Sensitivity
}

export interface DenyBody {
  note?: string
}

export type GrantStatus = 'ACTIVE' | 'REVOKED' | 'EXPIRED'

export interface Grant {
  id: string
  clientId: string
  clientName: string
  scopes: string[]
  purpose: string
  maxSensitivity: Sensitivity
  createdAt: string
  expiresAt: string
  maxReads: number | null
  readsUsed: number
  allowedHours: AllowedHours | null
  revokedAt: string | null
  lastReadAt: string | null
  status: GrantStatus
}

export type AuditEventType =
  | 'VAULT_ATTRIBUTE_CREATED'
  | 'VAULT_ATTRIBUTE_UPDATED'
  | 'VAULT_ATTRIBUTE_DELETED'
  | 'CLIENT_REGISTERED'
  | 'CLIENT_SECRET_ROTATED'
  | 'CLIENT_DISABLED'
  | 'ACCESS_REQUESTED'
  | 'REQUEST_APPROVED'
  | 'REQUEST_DENIED'
  | 'GRANT_REVOKED'
  | 'TOKEN_ISSUED'
  | 'DATA_READ'
  | 'DATA_DENIED'

export interface AuditEntry {
  seq: number
  eventType: AuditEventType
  actorType: string
  actorId: string
  clientId: string | null
  grantId: string | null
  /** A JSON document, as a string. Never contains attribute values. */
  detail: string
  occurredAt: string
  prevHash: string
  entryHash: string
}

export interface Dashboard {
  pendingRequests: number
  activeGrants: Grant[]
  recentAccess: AuditEntry[]
}

export type ChainBreakReason =
  'ENTRY_HASH_MISMATCH' | 'PREV_HASH_MISMATCH' | 'SEQUENCE_GAP' | 'HEAD_MISMATCH'

export interface ChainReport {
  valid: boolean
  entriesChecked: number
  firstBrokenSeq: number | null
  reason: ChainBreakReason | null
  headSeq: number
  headHash: string
}
