import { addDays, calendarDaysBetween, parseCalendarDate } from '../../../lib/dates'
import type { Item, ItemCategory, Plan } from '../api/types'
import { isTerminal } from '../api/types'

/**
 * Default follow-up plan, a port of the service's `EscalationPlan.defaultFor`: offsets are measured
 * from the day the item is expected, so a refund promised in 10 days is first nudged 3 days after that.
 */
export function defaultPlan(category: ItemCategory, daysUntilExpected: number): Plan {
  const base = Math.max(0, Math.min(daysUntilExpected, 365))
  switch (category) {
    case 'REFUND':
      return plan(base, 3, 10, 21, 45)
    case 'CLAIM':
      return plan(base, 7, 21, 35, 90)
    case 'REIMBURSEMENT':
      return plan(base, 5, 14, 28, 60)
    case 'APPROVAL':
      return plan(base, 3, 7, 14, 30)
    case 'DELIVERY':
      return plan(base, 2, 7, 14, 30)
    case 'OTHER':
      return plan(base, 5, 14, 0, 45)
  }
}

function plan(base: number, nudge: number, escalate: number, final: number, expire: number): Plan {
  return {
    nudgeAfterDays: base + nudge,
    escalateAfterDays: base + escalate,
    finalNoticeAfterDays: final === 0 ? 0 : base + final,
    expireAfterDays: base + expire,
  }
}

export type PlanErrors = Partial<Record<keyof Plan, string>>

/** The service's `EscalationPlan` rules, reported per field. */
export function validatePlan(p: Plan): PlanErrors {
  const errors: PlanErrors = {}
  const whole = (n: number) => Number.isInteger(n)
  if (!whole(p.nudgeAfterDays) || p.nudgeAfterDays < 1)
    errors.nudgeAfterDays = 'Use a whole number of days, at least 1.'
  if (!whole(p.escalateAfterDays) || p.escalateAfterDays <= p.nudgeAfterDays)
    errors.escalateAfterDays = 'Must come after the nudge.'
  if (!whole(p.finalNoticeAfterDays) || p.finalNoticeAfterDays < 0)
    errors.finalNoticeAfterDays = 'Use 0 to skip the final notice, or a later day.'
  else if (p.finalNoticeAfterDays !== 0 && p.finalNoticeAfterDays <= p.escalateAfterDays)
    errors.finalNoticeAfterDays = 'Must come after the escalation, or be 0 to skip it.'
  if (
    !whole(p.expireAfterDays) ||
    p.expireAfterDays <= Math.max(p.escalateAfterDays, p.finalNoticeAfterDays)
  )
    errors.expireAfterDays = 'Must come after the last letter.'
  return errors
}

export type StepKey = 'nudge' | 'escalate' | 'finalNotice' | 'expire'

export interface ScheduleStep {
  key: StepKey
  /** Days after tracking starts. */
  day: number
  date: Date
  title: string
  description: string
}

/** The follow-up timeline a plan produces, with calendar dates counted from `start`. */
export function buildSchedule(p: Plan, start: Date): ScheduleStep[] {
  const steps: ScheduleStep[] = [
    {
      key: 'nudge',
      day: p.nudgeAfterDays,
      date: addDays(start, p.nudgeAfterDays),
      title: 'Friendly nudge',
      description: 'A polite reminder is prepared for you to send. The item moves to Nudged.',
    },
    {
      key: 'escalate',
      day: p.escalateAfterDays,
      date: addDays(start, p.escalateAfterDays),
      title: 'Formal escalation letter',
      description:
        'A firm letter with consumer-rights wording and a 14 day deadline is drafted. The item moves to Escalated.',
    },
  ]
  if (p.finalNoticeAfterDays > 0)
    steps.push({
      key: 'finalNotice',
      day: p.finalNoticeAfterDays,
      date: addDays(start, p.finalNoticeAfterDays),
      title: 'Final notice',
      description: 'A last warning with a 7 day deadline is drafted before you take it further.',
    })
  steps.push({
    key: 'expire',
    day: p.expireAfterDays,
    date: addDays(start, p.expireAfterDays),
    title: 'Mark as expired',
    description: 'If nobody has answered by now, the item is closed as Expired.',
  })
  return steps
}

export type DueState =
  { kind: 'overdue'; days: number } | { kind: 'today' } | { kind: 'upcoming'; days: number }

/** How an active item stands against its expected-by date. `null` for closed items. */
export function dueState(item: Pick<Item, 'status' | 'expectedBy'>, now: Date): DueState | null {
  if (isTerminal(item.status)) return null
  const expected = parseCalendarDate(item.expectedBy)
  if (!expected) return null
  const days = calendarDaysBetween(now, expected)
  if (days < 0) return { kind: 'overdue', days: -days }
  return days === 0 ? { kind: 'today' } : { kind: 'upcoming', days }
}
