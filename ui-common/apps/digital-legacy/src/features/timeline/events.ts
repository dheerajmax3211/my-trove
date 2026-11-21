import type { TimelineEntry } from '../../api/types'

const TITLES: Record<string, string> = {
  VAULT_CREATED: 'Vault created',
  VAULT_UPDATED: 'Vault content updated',
  VAULT_ROTATED: 'Vault key rotated; all shares wiped',
  POLICY_SET: 'Check-in policy saved',
  ARMED: 'Switch armed',
  DISARMED: 'Switch disarmed',
  CHECK_IN: 'You checked in',
  PAUSED: 'Vacation pause started',
  PAUSE_ENDED: 'Vacation pause ended',
  STATE_CHANGED: 'Switch state changed',
  ESCALATION_STEP_EXECUTED: 'Reminder step sent',
  QUORUM_REACHED: 'Enough trustees approved',
  QUORUM_LOST: 'Approval quorum lost',
  RELEASED: 'Vault released to trustees',
  TRUSTEE_INVITED: 'Trustee invited',
  TRUSTEE_ACCEPTED: 'Trustee registered a key',
  TRUSTEE_REVOKED: 'Trustee revoked',
  SHARE_UPLOADED: 'Sealed share uploaded',
  SHARE_CONFIRMED: 'Trustee confirmed their share',
  APPROVAL_CAST: 'Trustee voted',
  SHARE_FETCHED: 'Trustee downloaded their sealed share',
  CIPHERTEXT_FETCHED: 'Trustee downloaded the encrypted vault',
}

const ACTORS = { OWNER: 'You', TRUSTEE: 'A trustee', SYSTEM: 'The scheduler' } as const

function text(detail: Record<string, unknown>, key: string): string | null {
  const value = detail[key]
  return typeof value === 'string' || typeof value === 'number' ? String(value) : null
}

/** One line of plain language per audit event; detail values are never ciphertext, shares or keys. */
export function describeEvent(entry: TimelineEntry): {
  title: string
  summary: string
  actor: string
} {
  const d = entry.detail
  const parts: string[] = []
  switch (entry.eventType) {
    case 'STATE_CHANGED':
      parts.push(`${text(d, 'from') ?? '?'} to ${text(d, 'to') ?? '?'}`)
      if (text(d, 'reason')) parts.push(`(${text(d, 'reason')})`)
      break
    case 'CHECK_IN':
      if (text(d, 'previousState')) parts.push(`from ${text(d, 'previousState')}`)
      if (Number(d.approvalsInvalidated) > 0)
        parts.push(`${text(d, 'approvalsInvalidated')} approval(s) voided`)
      break
    case 'APPROVAL_CAST':
      parts.push(text(d, 'decision') === 'APPROVE' ? 'approved' : 'declined')
      break
    case 'ESCALATION_STEP_EXECUTED':
      parts.push(
        `step ${Number(d.step) + 1}, ${text(d, 'urgency') ?? ''} to ${text(d, 'audience') ?? ''}`.trim(),
      )
      break
    case 'VAULT_CREATED':
    case 'VAULT_UPDATED':
    case 'VAULT_ROTATED':
      if (text(d, 'bytes')) parts.push(`${text(d, 'bytes')} encrypted bytes`)
      break
    case 'POLICY_SET':
      parts.push(`quorum ${text(d, 'quorum') ?? '?'}`)
      break
    case 'TRUSTEE_ACCEPTED':
      if (text(d, 'keyAlgorithm')) parts.push(text(d, 'keyAlgorithm') ?? '')
      break
    default:
      break
  }
  return {
    title: TITLES[entry.eventType] ?? entry.eventType.replace(/_/g, ' ').toLowerCase(),
    summary: parts.join(' '),
    actor: ACTORS[entry.actorKind],
  }
}
