/** Wire types mirroring the waiting-on service DTOs (ItemController records). Dates are ISO strings. */

export const ITEM_STATUSES = [
  'OPEN',
  'NUDGED',
  'ESCALATED',
  'RESOLVED',
  'EXPIRED',
  'CANCELLED',
] as const
export type ItemStatus = (typeof ITEM_STATUSES)[number]

export const ACTIVE_STATUSES: readonly ItemStatus[] = ['OPEN', 'NUDGED', 'ESCALATED']

export const ITEM_CATEGORIES = [
  'REFUND',
  'CLAIM',
  'REIMBURSEMENT',
  'APPROVAL',
  'DELIVERY',
  'OTHER',
] as const
export type ItemCategory = (typeof ITEM_CATEGORIES)[number]

export const TONES = ['NUDGE', 'ESCALATION', 'FINAL_NOTICE'] as const
export type Tone = (typeof TONES)[number]

export type Stage =
  | 'AWAITING_NUDGE'
  | 'NUDGED'
  | 'ESCALATED'
  | 'FINAL_NOTICE'
  | 'RESOLVED'
  | 'EXPIRED'
  | 'CANCELLED'
  | 'CLOSED_EXTERNALLY'

export type NextAction = 'NUDGE' | 'ESCALATE' | 'FINAL_NOTICE' | 'EXPIRE' | 'NONE'

export type EventType =
  | 'CREATED'
  | 'NUDGE_SENT'
  | 'ESCALATION_DRAFTED'
  | 'FINAL_NOTICE_DRAFTED'
  | 'REPLY_RECEIVED'
  | 'SNOOZED'
  | 'RESOLVED'
  | 'EXPIRED'
  | 'CANCELLED'

/** Days after tracking starts. `finalNoticeAfterDays` 0 means there is no final-notice stage. */
export interface Plan {
  nudgeAfterDays: number
  escalateAfterDays: number
  finalNoticeAfterDays: number
  expireAfterDays: number
}

/** Live workflow state. Only present on the detail and snooze responses, and only while the item is active. */
export interface FollowUp {
  stage: Stage
  nextAction: NextAction
  nextActionAt: string | null
  snoozedDays: number
}

export interface Item {
  id: string
  title: string
  counterparty: string
  counterpartyEmail: string | null
  category: ItemCategory
  amount: number | null
  currency: string | null
  /** `YYYY-MM-DD` */
  expectedBy: string
  status: ItemStatus
  outcome: string | null
  replyAddress: string
  plan: Plan
  createdAt: string
  updatedAt: string
  closedAt: string | null
  followUp: FollowUp | null
}

export interface TimelineEvent {
  id: string
  type: EventType
  summary: string
  detail: string | null
  occurredAt: string
}

export interface Draft {
  tone: Tone
  subject: string
  body: string
  note: string
}

export interface CreateItemInput {
  title: string
  counterparty: string
  counterpartyEmail?: string
  category: ItemCategory
  amount?: number
  currency?: string
  expectedBy: string
  plan?: Plan
}

export interface ResolveInput {
  outcome?: string
}

export interface SnoozeInput {
  days: number
}

export const isTerminal = (status: ItemStatus): boolean => !ACTIVE_STATUSES.includes(status)
