import type { ReplyClassification } from '../features/items/api/types'

/**
 * Demo stand-in for the backend's reply classifier (RuleBasedReplyClassifier). The real rules live in the service and
 * decide what a reply does; this only keeps the demo honest about the same three outcomes, in the same order: pending
 * is never payment, refusals beat approvals, requests for documents hold the schedule.
 */
export function classifyReply(text: string): ReplyClassification {
  const t = text.toLowerCase().replace(/\s+/g, ' ')
  if (/\bnot yet\b|\bhas not been\b|\bhave not been\b/.test(t)) return 'UNKNOWN'
  if (/\b(denied|declined|rejected|refused?)\b|\bregret to (inform|advise)\b|\bno refund\b/.test(t))
    return 'REJECTED'
  if (
    /\b(please|kindly) (provide|send|submit|upload|attach|confirm|share)\b/.test(t) ||
    /\b(additional|further|missing) (information|documents?|details|evidence|proof)\b/.test(t)
  )
    return 'NEEDS_INFO'
  if (/\bwill (be )?(paid|refunded|approved|processed)\b/.test(t)) return 'UNKNOWN'
  if (
    /\b(has|have|had|was|were) been (paid|refunded|processed|approved|issued|credited|reimbursed)\b/.test(
      t,
    ) ||
    /\b(refund|payment|reimbursement) (is|was) (issued|processed|approved|sent)\b/.test(t) ||
    /\bapproved\b/.test(t)
  )
    return 'PAID'
  return 'UNKNOWN'
}
