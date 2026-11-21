import { useMemo } from 'react'
import type { TodayItem } from '@platform/workspace-kit'
import type { StateView, TrusteeView } from '../api/types'
import { useNow } from '../lib/clock'
import { DAY, formatDateTime, formatDuration } from '../lib/format'
import { useStateQuery, useTrusteesQuery } from './queries'

const SOON_MS = 7 * DAY * 1000
const EXPIRING_MS = 3 * DAY * 1000

const OVERDUE_STATES: ReadonlySet<StateView['state']> = new Set([
  'GRACE',
  'ESCALATING',
  'RELEASE_PENDING',
])

/**
 * What deserves attention today, as plain data (the hook below feeds it). Order of importance: a released
 * vault, a missed or imminent check-in, an active vacation pause or a healthy armed switch, then invitations
 * that trustees have not answered. Every `to` is module-relative.
 */
export function buildTodayItems(
  state: StateView | undefined,
  trustees: readonly TrusteeView[] | undefined,
  now: number,
): TodayItem[] {
  const items: TodayItem[] = []

  if (state) {
    const due = state.nextDueAt ? Date.parse(state.nextDueAt) : Number.NaN
    if (state.state === 'RELEASED') {
      items.push({
        id: 'released',
        title: 'Your vault was released to your trustees',
        ...(state.releasedAt
          ? { subtitle: `Released ${formatDateTime(state.releasedAt)}.`, dueAt: state.releasedAt }
          : {}),
        severity: 'danger',
        to: '/',
      })
    } else if (state.armed && state.pausedUntil) {
      items.push({
        id: 'paused',
        title: 'Vacation mode is on',
        subtitle: `Your timers resume ${formatDateTime(state.pausedUntil)}.`,
        dueAt: state.pausedUntil,
        severity: 'info',
        to: '/',
      })
    } else if (state.armed && OVERDUE_STATES.has(state.state)) {
      items.push({
        id: 'check-in',
        title: 'Check in now',
        subtitle:
          state.state === 'GRACE'
            ? 'You missed a check-in. One tap on "I\'m here" resets everything.'
            : 'Your trustees are being told. One tap on "I\'m here" stops it.',
        ...(state.nextDueAt ? { dueAt: state.nextDueAt } : {}),
        severity: 'danger',
        to: '/',
      })
    } else if (state.armed && !Number.isNaN(due) && due - now <= SOON_MS) {
      const overdue = due <= now
      items.push({
        id: 'check-in',
        title: overdue ? 'Your check-in is overdue' : 'Your next check-in is coming up',
        subtitle: overdue
          ? 'Tap "I\'m here" before the grace period starts counting against you.'
          : `Due in ${formatDuration((due - now) / 1000)}.`,
        dueAt: new Date(due).toISOString(),
        severity: overdue ? 'danger' : 'warn',
        to: '/',
      })
    } else if (state.armed) {
      items.push({
        id: 'armed',
        title: 'Your switch is armed',
        ...(state.nextDueAt
          ? {
              subtitle: `Next check-in due ${formatDateTime(state.nextDueAt)}.`,
              dueAt: state.nextDueAt,
            }
          : {}),
        severity: 'info',
        to: '/',
      })
    }
  }

  const waiting = (trustees ?? []).filter((t) => t.status === 'INVITED')
  if (waiting.length > 0) {
    const soonest = waiting
      .map((t) => (t.inviteExpiresAt ? Date.parse(t.inviteExpiresAt) : Number.NaN))
      .filter((time) => !Number.isNaN(time))
      .sort((a, b) => a - b)[0]
    const names = waiting.map((t) => t.label).join(', ')
    items.push({
      id: 'invitations',
      title:
        waiting.length === 1
          ? '1 trustee invitation has not been accepted'
          : `${waiting.length} trustee invitations have not been accepted`,
      subtitle: `${names} ${waiting.length === 1 ? 'has' : 'have'} not registered a key yet.`,
      ...(soonest !== undefined ? { dueAt: new Date(soonest).toISOString() } : {}),
      severity: soonest !== undefined && soonest - now <= EXPIRING_MS ? 'warn' : 'info',
      to: '/trustees',
    })
  }

  return items
}

/** The module's contribution to the workspace "Today" feed. Items keep their identity until the data changes. */
export function useTodayItems(): { items: TodayItem[]; loading: boolean } {
  const state = useStateQuery()
  const trustees = useTrusteesQuery()
  // minute resolution is plenty for "due within 7 days" and keeps the returned array stable between renders
  const now = useNow(60_000)
  const stateData = state.data
  const trusteeData = trustees.data
  const items = useMemo(
    () => buildTodayItems(stateData, trusteeData, now),
    [stateData, trusteeData, now],
  )
  return { items, loading: state.isPending || trustees.isPending }
}
