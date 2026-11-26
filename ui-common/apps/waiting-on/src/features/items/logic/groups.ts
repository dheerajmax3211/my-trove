import { calendarDaysBetween } from '../../../lib/dates'
import { isTerminal, type Item, type NextStep } from '../api/types'
import { dueState } from './schedule'

export type GroupKey = 'overdue' | 'soon' | 'later' | 'closed'

export const GROUP_ORDER: readonly GroupKey[] = ['overdue', 'soon', 'later', 'closed']

/** Items expected within this many days (today included) are "due soon"; later ones wait in "later". */
export const SOON_WINDOW_DAYS = 7

export const GROUP_TITLE: Record<GroupKey, string> = {
  overdue: 'Overdue',
  soon: 'Due soon',
  later: 'Later',
  closed: 'Resolved and closed',
}

export const GROUP_BLURB: Record<GroupKey, string> = {
  overdue: 'Past the date they promised. The follow-ups are already running.',
  soon: `Expected within the next ${SOON_WINDOW_DAYS} days.`,
  later: `Expected more than ${SOON_WINDOW_DAYS} days from now.`,
  closed: 'Resolved, expired or cancelled. Nothing more will be sent.',
}

export function groupOf(item: Item, now: Date): GroupKey {
  if (isTerminal(item.status)) return 'closed'
  const due = dueState(item, now)
  if (!due) return 'later'
  if (due.kind === 'overdue') return 'overdue'
  if (due.kind === 'today') return 'soon'
  return due.days <= SOON_WINDOW_DAYS ? 'soon' : 'later'
}

/** Splits items by urgency, keeping the order the service returned (expected date, oldest first). */
export function groupItems(items: readonly Item[], now: Date): Record<GroupKey, Item[]> {
  const groups: Record<GroupKey, Item[]> = { overdue: [], soon: [], later: [], closed: [] }
  for (const item of items) groups[groupOf(item, now)].push(item)
  return groups
}

export interface NextFollowUp {
  action: Exclude<NextStep['action'], 'EXPIRE'>
  at: Date
  item: Item
  /** Calendar days from today: 0 is today. */
  inDays: number
}

/**
 * The earliest follow-up still to come, from the service's `nextStep`: the first nudge, escalation or final notice
 * due today or later. Expiry is not a follow-up, and a step in the past is skipped (the service is acting on it).
 */
export function nextFollowUp(items: readonly Item[], now: Date): NextFollowUp | null {
  let best: NextFollowUp | null = null
  for (const item of items) {
    const next = item.nextStep
    if (!next || next.action === 'EXPIRE') continue
    const at = new Date(next.at)
    const inDays = calendarDaysBetween(now, at)
    if (inDays < 0) continue
    if (!best || at < best.at) best = { action: next.action, at, item, inDays }
  }
  return best
}

export interface Summary {
  open: number
  overdue: number
  next: NextFollowUp | null
}

/** The numbers at the top of the home page, from the active items only. */
export function summarize(active: readonly Item[], now: Date): Summary {
  const open = active.filter((i) => !isTerminal(i.status))
  return {
    open: open.length,
    overdue: open.filter((i) => dueState(i, now)?.kind === 'overdue').length,
    next: nextFollowUp(open, now),
  }
}

/** The sentence under the page title: what is the state of things, in words. */
export function headline({ open, overdue }: Summary): string {
  if (open === 0) return 'Nothing is waiting on anyone.'
  if (overdue === 0)
    return open === 1
      ? 'Nothing is overdue. One item is waiting.'
      : `Nothing is overdue. ${open} items are waiting.`
  if (open === 1) return 'Your one item is past its expected date.'
  if (overdue === open) return `All ${open} items are past their expected date.`
  return `${overdue} of ${open} items ${overdue === 1 ? 'is' : 'are'} past ${overdue === 1 ? 'its' : 'their'} expected date.`
}

/** "Today", "Tomorrow", "In 5 days". */
export function whenLabel(inDays: number): string {
  if (inDays === 0) return 'Today'
  if (inDays === 1) return 'Tomorrow'
  return `In ${inDays} days`
}
