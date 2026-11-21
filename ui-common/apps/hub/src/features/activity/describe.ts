import { formatBytes, formatDateTime } from '../../lib/format'
import type { AuditEvent } from './types'

/** Actions shared-service records, in the order the filter lists them. */
export const ACTION_LABELS: Readonly<Record<string, string>> = {
  'household.created': 'Created a household',
  'household.deleted': 'Deleted a household',
  'invite.created': 'Created an invite',
  'invite.revoked': 'Revoked an invite',
  'member.joined': 'Joined a household',
  'member.left': 'Left a household',
  'member.removed': 'Removed a member',
  'member.role_changed': 'Changed a member role',
  'reminder.created': 'Created a reminder',
  'reminder.updated': 'Updated a reminder',
  'reminder.cancelled': 'Cancelled a reminder',
  'file.uploaded': 'Uploaded a file',
  'file.deleted': 'Deleted a file',
  'file.download_link_issued': 'Created a download link',
}

export const actionLabel = (action: string): string => ACTION_LABELS[action] ?? action

const HIDDEN_DETAILS = new Set(['sha256', 'inviteId'])
const ISO_DATE = /^\d{4}-\d{2}-\d{2}T/

function detailValue(key: string, value: unknown): string {
  if (key === 'sizeBytes' && typeof value === 'number') return formatBytes(value)
  if (typeof value === 'string' && ISO_DATE.test(value)) return formatDateTime(value)
  return typeof value === 'string' ? value : JSON.stringify(value)
}

/** "name: Rivera household, role: MEMBER". Hashes and ids are left out; they are noise to a person. */
export function describeDetails(event: AuditEvent): string {
  return Object.entries(event.details)
    .filter(([key]) => !HIDDEN_DETAILS.has(key))
    .map(([key, value]) => `${key === 'sizeBytes' ? 'size' : key}: ${detailValue(key, value)}`)
    .join(', ')
}
