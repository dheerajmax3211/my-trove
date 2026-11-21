import { apiQueryKey, useApiClient } from '@platform/api-client'
import type { TodayItem } from '@platform/workspace-kit'
import { useQueries } from '@tanstack/react-query'
import { useMemo } from 'react'
import { sharedPaths } from '../api/paths'
import { useHouseholds } from '../features/households/hooks'
import type { Household, Invite } from '../features/households/types'
import { useReminders } from '../features/reminders/hooks'
import type { Reminder } from '../features/reminders/types'
import { useCoreEnv } from './env'

/** Reminders due within this many days (or already overdue) reach the workspace's Today feed. */
export const TODAY_WINDOW_DAYS = 3
const DAY_MS = 86_400_000

function describeWhen(dueAt: string, now: number): string {
  const days = Math.floor((new Date(dueAt).getTime() - now) / DAY_MS)
  if (days < 0) {
    const late = Math.max(1, Math.ceil((now - new Date(dueAt).getTime()) / DAY_MS))
    return `Overdue by ${late} ${late === 1 ? 'day' : 'days'}`
  }
  if (days === 0) return 'Due within a day'
  return `Due in ${days + 1} days`
}

/** Pure: what the workspace should show for these reminders and pending invites at `now`. */
export function buildTodayItems(input: {
  reminders: readonly Reminder[]
  households: readonly Household[]
  invites: ReadonlyArray<{ household: Household; invites: readonly Invite[] }>
  now: number
}): TodayItem[] {
  const { reminders, households, invites, now } = input
  const horizon = now + TODAY_WINDOW_DAYS * DAY_MS
  const items: TodayItem[] = []

  for (const reminder of reminders) {
    if (reminder.status !== 'ACTIVE') continue
    const due = new Date(reminder.dueAt).getTime()
    if (Number.isNaN(due) || due > horizon) continue
    const scope = reminder.householdId
      ? (households.find((h) => h.id === reminder.householdId)?.name ?? 'Household')
      : 'Personal'
    items.push({
      id: `reminder:${reminder.id}`,
      title: reminder.title,
      subtitle: `${describeWhen(reminder.dueAt, now)} · ${scope}`,
      dueAt: reminder.dueAt,
      severity: due < now ? 'danger' : 'warn',
      to: '/reminders',
    })
  }

  for (const { household, invites: pending } of invites) {
    for (const invite of pending) {
      items.push({
        id: `invite:${invite.id}`,
        title: `An invite to ${household.name} has not been used`,
        subtitle: `Joins as ${invite.role === 'OWNER' ? 'an owner' : 'a member'}. Expires ${new Date(invite.expiresAt).toLocaleDateString()}.`,
        dueAt: invite.expiresAt,
        severity: 'info',
        to: `/households/${household.id}`,
      })
    }
  }
  return items
}

/**
 * The Household module's contribution to the workspace "Today" feed: reminders due in the next three days or
 * overdue (`warn` / `danger`) and invite codes you created that nobody has used yet (`info`). It runs inside the
 * module's providers, so it shares the module's cache with the pages.
 */
export function useTodayItems(): { items: TodayItem[]; loading: boolean } {
  const client = useApiClient()
  const { now } = useCoreEnv()
  const reminders = useReminders({ status: 'ACTIVE' })
  const households = useHouseholds()
  const owned = useMemo(
    () => (households.data ?? []).filter((h) => h.role === 'OWNER'),
    [households.data],
  )
  const inviteQueries = useQueries({
    queries: owned.map((household) => ({
      queryKey: apiQueryKey(sharedPaths.householdInvites(household.id)),
      queryFn: ({ signal }: { signal: AbortSignal }) =>
        client.get<Invite[]>(sharedPaths.householdInvites(household.id), { signal }),
    })),
  })
  const inviteData = inviteQueries.map((q) => q.data)
  const inviteKey = inviteQueries.map((q) => q.dataUpdatedAt).join(',')
  const invitesPending = inviteQueries.some((q) => q.isPending)

  return useMemo(() => {
    const items = buildTodayItems({
      reminders: reminders.data ?? [],
      households: households.data ?? [],
      invites: owned.flatMap((household, i) => {
        const list = inviteData[i]
        return list ? [{ household, invites: list }] : []
      }),
      now: now(),
    })
    return { items, loading: reminders.isPending || households.isPending || invitesPending }
    // inviteData is a fresh array each render; inviteKey changes exactly when its contents do.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    reminders.data,
    reminders.isPending,
    households.data,
    households.isPending,
    owned,
    invitesPending,
    inviteKey,
    now,
  ])
}
