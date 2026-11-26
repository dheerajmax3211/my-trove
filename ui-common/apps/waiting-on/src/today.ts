import { useApiQuery } from '@platform/api-client'
import type { TodayItem } from '@platform/workspace-kit'
import { useMemo } from 'react'
import { useClock } from './lib/clock'
import { calendarDaysBetween, pluralDays } from './lib/dates'
import { ACTIVE_STATUSES, type Item } from './features/items/api/types'
import { itemsPath } from './features/items/api/paths'
import { NEXT_ACTION_LABEL } from './features/items/logic/labels'
import { dueState } from './features/items/logic/schedule'

/** How many days ahead something counts as "soon" in the workspace Today feed. */
export const SOON_DAYS = 3

const RANK: Record<TodayItem['severity'], number> = { danger: 0, warn: 1, info: 2 }

/**
 * Turns the active items into Today entries: overdue ones (danger), ones due within three days (warn)
 * and ones whose next follow-up is scheduled within three days (info). One entry per item, the most
 * urgent reason wins. Sorted by urgency, then by date.
 */
export function todayItemsFrom(items: readonly Item[], now: Date): TodayItem[] {
  const out: TodayItem[] = []
  for (const item of items) {
    const due = dueState(item, now)
    const next = item.nextStep
    const base = { id: item.id, title: item.title, to: `/items/${item.id}` }
    const who = `Waiting on ${item.counterparty}`
    if (due?.kind === 'overdue') {
      out.push({
        ...base,
        subtitle: `${who}. Overdue by ${pluralDays(due.days)}`,
        dueAt: `${item.expectedBy}T00:00:00`,
        severity: 'danger',
      })
    } else if (due && (due.kind === 'today' || due.days <= SOON_DAYS)) {
      out.push({
        ...base,
        subtitle: `${who}. ${due.kind === 'today' ? 'Due today' : `Due in ${pluralDays(due.days)}`}`,
        dueAt: `${item.expectedBy}T00:00:00`,
        severity: 'warn',
      })
    } else if (next && next.action !== 'EXPIRE') {
      const days = calendarDaysBetween(now, new Date(next.at))
      if (days <= SOON_DAYS)
        out.push({
          ...base,
          subtitle: `${who}. ${NEXT_ACTION_LABEL[next.action]} is scheduled`,
          dueAt: next.at,
          severity: 'info',
        })
    }
  }
  return out.sort(
    (a, b) => RANK[a.severity] - RANK[b.severity] || (a.dueAt ?? '').localeCompare(b.dueAt ?? ''),
  )
}

/** The workspace Today feed for this product. Runs inside the module's providers and API client. */
export function useTodayItems(): { items: TodayItem[]; loading: boolean } {
  const clock = useClock()
  const query = useApiQuery<Item[]>(itemsPath, {
    query: { limit: 100, status: ACTIVE_STATUSES },
  })
  const data = query.data
  const items = useMemo(() => (data ? todayItemsFrom(data, clock()) : []), [data, clock])
  return { items, loading: query.isPending }
}
