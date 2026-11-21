import type { ProductModule, TodayItem } from '@platform/workspace-kit'

export type Severity = TodayItem['severity']

export interface FeedItem extends TodayItem {
  module: ProductModule
  /** Absolute workspace URL: `/app/<module>` + the item's `to`. */
  href: string
}

const RANK: Record<Severity, number> = { danger: 0, warn: 1, info: 2 }

export const SEVERITY_LABEL: Record<Severity, string> = {
  danger: 'Urgent',
  warn: 'Soon',
  info: 'For your information',
}

/** Most severe first; within a severity the earliest due date first; items with no date last. */
export function sortFeed<T extends Pick<TodayItem, 'severity' | 'dueAt' | 'title'>>(
  items: readonly T[],
): T[] {
  const time = (item: T) => {
    const parsed = item.dueAt ? Date.parse(item.dueAt) : Number.NaN
    return Number.isNaN(parsed) ? Number.POSITIVE_INFINITY : parsed
  }
  return [...items].sort(
    (a, b) =>
      RANK[a.severity] - RANK[b.severity] || time(a) - time(b) || a.title.localeCompare(b.title),
  )
}

export function greetingFor(date: Date): string {
  const hour = date.getHours()
  if (hour < 5) return 'Good evening'
  if (hour < 12) return 'Good morning'
  if (hour < 18) return 'Good afternoon'
  return 'Good evening'
}

const DAY = 86_400_000

function startOfDay(date: Date): number {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime()
}

/** "Overdue by 2 days", "Due today", "Due tomorrow", "Due in 5 days", or a date beyond two weeks. */
export function describeDue(dueAt: string | undefined, now: Date): string | null {
  if (!dueAt) return null
  const due = new Date(dueAt)
  if (Number.isNaN(due.getTime())) return null
  const days = Math.round((startOfDay(due) - startOfDay(now)) / DAY)
  if (days < 0) return `Overdue by ${-days} ${-days === 1 ? 'day' : 'days'}`
  if (days === 0) return 'Due today'
  if (days === 1) return 'Due tomorrow'
  if (days <= 14) return `Due in ${days} days`
  return `Due ${new Intl.DateTimeFormat('en', { day: 'numeric', month: 'short' }).format(due)}`
}

export function firstName(displayName: string | null): string | null {
  const first = displayName?.trim().split(/\s+/)[0]
  return first ? first : null
}

export function longDate(date: Date): string {
  return new Intl.DateTimeFormat('en', { weekday: 'long', day: 'numeric', month: 'long' }).format(
    date,
  )
}
