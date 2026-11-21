import type { BadgeVariant } from '@platform/ui'
import type { EventType, ItemCategory, ItemStatus, NextAction, Stage, Tone } from '../api/types'

export const STATUS_LABEL: Record<ItemStatus, string> = {
  OPEN: 'Open',
  NUDGED: 'Nudged',
  ESCALATED: 'Escalated',
  RESOLVED: 'Resolved',
  EXPIRED: 'Expired',
  CANCELLED: 'Cancelled',
}

export const STATUS_VARIANT: Record<ItemStatus, BadgeVariant> = {
  OPEN: 'info',
  NUDGED: 'warning',
  ESCALATED: 'danger',
  RESOLVED: 'success',
  EXPIRED: 'neutral',
  CANCELLED: 'neutral',
}

export const CATEGORY_LABEL: Record<ItemCategory, string> = {
  REFUND: 'Refund',
  CLAIM: 'Claim',
  REIMBURSEMENT: 'Reimbursement',
  APPROVAL: 'Approval',
  DELIVERY: 'Delivery',
  OTHER: 'Other',
}

export const NEXT_ACTION_LABEL: Record<NextAction, string> = {
  NUDGE: 'Friendly nudge',
  ESCALATE: 'Formal escalation letter',
  FINAL_NOTICE: 'Final notice',
  EXPIRE: 'Mark as expired',
  NONE: 'Nothing scheduled',
}

export const STAGE_LABEL: Record<Stage, string> = {
  AWAITING_NUDGE: 'Waiting to send the first nudge',
  NUDGED: 'Nudged, waiting to escalate',
  ESCALATED: 'Escalated, waiting for a reply',
  FINAL_NOTICE: 'Final notice sent, waiting to expire',
  RESOLVED: 'Resolved',
  EXPIRED: 'Expired',
  CANCELLED: 'Cancelled',
  CLOSED_EXTERNALLY: 'Closed',
}

export const EVENT_LABEL: Record<EventType, string> = {
  CREATED: 'Tracking started',
  NUDGE_SENT: 'Friendly nudge',
  ESCALATION_DRAFTED: 'Escalation letter drafted',
  FINAL_NOTICE_DRAFTED: 'Final notice drafted',
  REPLY_RECEIVED: 'Reply received',
  SNOOZED: 'Snoozed',
  RESOLVED: 'Resolved',
  EXPIRED: 'Expired',
  CANCELLED: 'Cancelled',
}

/** Events whose `detail` is a letter that can run to many lines. */
export const LETTER_EVENTS: readonly EventType[] = [
  'NUDGE_SENT',
  'ESCALATION_DRAFTED',
  'FINAL_NOTICE_DRAFTED',
]

export const TONE_LABEL: Record<Tone, string> = {
  NUDGE: 'Friendly nudge',
  ESCALATION: 'Formal escalation',
  FINAL_NOTICE: 'Final notice',
}

export const TONE_BLURB: Record<Tone, string> = {
  NUDGE: 'A polite reminder. Sent first, when the expected date has passed.',
  ESCALATION: 'A firm letter citing consumer-rights wording, with a 14 day deadline.',
  FINAL_NOTICE: 'The last warning before complaints and chargebacks, with a 7 day deadline.',
}

export function formatAmount(amount: number | null, currency: string | null): string | null {
  if (amount === null) return null
  try {
    return new Intl.NumberFormat(undefined, {
      style: 'currency',
      currency: currency ?? 'USD',
    }).format(amount)
  } catch {
    return `${currency ?? ''} ${amount}`.trim()
  }
}
