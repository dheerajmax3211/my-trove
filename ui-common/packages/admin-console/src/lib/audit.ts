import type { TimelineTone } from '@platform/ui'
import { ACTION_LABELS } from './catalogue'
import type { AuditEntry } from './types'

export const auditTitle = (entry: Pick<AuditEntry, 'action'>): string =>
  ACTION_LABELS[entry.action] ?? entry.action

/** One plain line for the entry's `detail` object (`{role}`, `{from, to}`, or whatever else the server wrote). */
export function auditDetail(entry: Pick<AuditEntry, 'action' | 'detail'>): string {
  const detail = entry.detail ?? {}
  const str = (key: string): string | undefined => {
    const v = detail[key]
    return typeof v === 'string' || typeof v === 'number' ? String(v) : undefined
  }
  if (entry.action === 'ROLE_GRANTED' || entry.action === 'ROLE_REVOKED') {
    const role = str('role')
    if (role) return `Role ${role}`
  }
  if (entry.action === 'PLAN_CHANGED') {
    const from = str('from')
    const to = str('to')
    if (from && to) return `${from} to ${to}`
  }
  const pairs = Object.entries(detail).map(
    ([k, v]) => `${k}: ${typeof v === 'string' ? v : JSON.stringify(v)}`,
  )
  return pairs.join(', ')
}

export function auditTone(entry: Pick<AuditEntry, 'action'>): TimelineTone {
  switch (entry.action) {
    case 'USER_SUSPENDED':
    case 'ROLE_REVOKED':
      return 'danger'
    case 'USER_RESTORED':
      return 'success'
    case 'ROLE_GRANTED':
      return 'brass'
    default:
      return 'accent'
  }
}
