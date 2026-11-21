import type { AuditEntry, AuditEventType, ChainBreakReason } from '../api/types'

export const EVENT_LABELS: Record<AuditEventType, string> = {
  VAULT_ATTRIBUTE_CREATED: 'Attribute added',
  VAULT_ATTRIBUTE_UPDATED: 'Attribute changed',
  VAULT_ATTRIBUTE_DELETED: 'Attribute deleted',
  CLIENT_REGISTERED: 'App registered',
  CLIENT_SECRET_ROTATED: 'App secret rotated',
  CLIENT_DISABLED: 'App disabled',
  ACCESS_REQUESTED: 'Access requested',
  REQUEST_APPROVED: 'Request approved',
  REQUEST_DENIED: 'Request denied',
  GRANT_REVOKED: 'Access revoked',
  TOKEN_ISSUED: 'Access token issued',
  DATA_READ: 'Data read',
  DATA_DENIED: 'Read denied',
}

export function eventLabel(type: string): string {
  return type in EVENT_LABELS ? EVENT_LABELS[type as AuditEventType] : type
}

const DENY_REASONS: Record<string, string> = {
  NO_GRANT: 'no grant',
  GRANT_REVOKED: 'grant was revoked',
  GRANT_EXPIRED: 'grant had expired',
  CLIENT_MISMATCH: 'wrong app',
  MAX_READS_EXHAUSTED: 'read limit used up',
  OUTSIDE_ALLOWED_HOURS: 'outside the allowed hours',
  PURPOSE_MISMATCH: 'purpose did not match',
  SCOPE_NOT_GRANTED: 'outside the granted scopes',
  SENSITIVITY_EXCEEDED: 'above the sensitivity limit',
  INVALID_REQUEST: 'invalid request',
}

type Detail = Record<string, unknown>

function parseDetail(entry: AuditEntry): Detail {
  try {
    const parsed: unknown = JSON.parse(entry.detail)
    return typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed)
      ? (parsed as Detail)
      : {}
  } catch {
    return {}
  }
}

const strings = (value: unknown): string[] =>
  Array.isArray(value) ? value.filter((v): v is string => typeof v === 'string') : []

/** One plain sentence about what an audit entry recorded. Never includes attribute values. */
export function summarizeEntry(entry: AuditEntry): string {
  const d = parseDetail(entry)
  switch (entry.eventType) {
    case 'DATA_READ': {
      const keys = strings(d.keys)
      const withheld = typeof d.withheldBySensitivity === 'number' ? d.withheldBySensitivity : 0
      const base =
        keys.length > 0 ? `Read ${keys.join(', ')}` : 'Read nothing (no matching attributes)'
      return withheld > 0 ? `${base}; ${withheld} withheld by the sensitivity limit` : base
    }
    case 'DATA_DENIED': {
      const reason = typeof d.reason === 'string' ? (DENY_REASONS[d.reason] ?? d.reason) : 'denied'
      return `Refused: ${reason}`
    }
    case 'VAULT_ATTRIBUTE_CREATED':
    case 'VAULT_ATTRIBUTE_UPDATED':
    case 'VAULT_ATTRIBUTE_DELETED':
      return typeof d.keyPath === 'string' ? d.keyPath : ''
    case 'CLIENT_REGISTERED':
      return typeof d.name === 'string' ? d.name : ''
    case 'ACCESS_REQUESTED':
    case 'REQUEST_APPROVED': {
      const scopes = strings(d.scopes)
      return scopes.length > 0 ? scopes.join(', ') : ''
    }
    case 'GRANT_REVOKED':
      return d.cause === 'CLIENT_DISABLED' ? 'Because the app was disabled' : 'By you'
    case 'CLIENT_DISABLED':
      return typeof d.grantsRevoked === 'number'
        ? `${d.grantsRevoked} grant${d.grantsRevoked === 1 ? '' : 's'} revoked`
        : ''
    default:
      return ''
  }
}

export interface ChainProblem {
  headline: string
  explanation: string
}

/** Plain-language meaning of the first broken link a verification reports. */
export function describeBreak(reason: ChainBreakReason, seq: number): ChainProblem {
  switch (reason) {
    case 'ENTRY_HASH_MISMATCH':
      return {
        headline: `Entry #${seq} was changed after it was written`,
        explanation:
          'The stored hash of this entry no longer matches its contents, so something in it was edited.',
      }
    case 'PREV_HASH_MISMATCH':
      return {
        headline: `Entry #${seq} does not link to the entry before it`,
        explanation:
          'Each entry records the hash of the previous one. This link was altered, or an earlier entry was replaced.',
      }
    case 'SEQUENCE_GAP':
      return {
        headline: `Entry #${seq} is missing or out of order`,
        explanation: 'An entry was deleted from the middle of the log, or one was inserted.',
      }
    case 'HEAD_MISMATCH':
      return {
        headline: `The log is missing entries from #${seq} onwards`,
        explanation:
          'The newest entries are missing: the recorded end of the log is further along than the entries that remain.',
      }
  }
}
