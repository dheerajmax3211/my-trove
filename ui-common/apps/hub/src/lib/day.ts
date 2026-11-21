/** Calendar-day arithmetic in the viewer's time zone, driven by a `now` the caller passes in. */

export type DayGroup = 'overdue' | 'today' | 'tomorrow' | 'week' | 'later' | 'earlier'

export const GROUP_LABELS: Record<DayGroup, string> = {
  overdue: 'Overdue',
  today: 'Today',
  tomorrow: 'Tomorrow',
  week: 'This week',
  later: 'Later',
  earlier: 'Earlier',
}

/** Display order of the groups, soonest and most urgent first. */
export const GROUP_ORDER: readonly DayGroup[] = [
  'overdue',
  'today',
  'tomorrow',
  'week',
  'later',
  'earlier',
]

function startOfDay(ms: number): number {
  const d = new Date(ms)
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime()
}

/** Whole calendar days from `now` to `dueMs`: 0 is today, 1 is tomorrow, -1 is yesterday. */
export function dayOffset(dueMs: number, nowMs: number): number {
  const a = startOfDay(dueMs)
  const b = startOfDay(nowMs)
  // Round, not floor: a day is 23 or 25 hours across a daylight-saving change.
  return Math.round((a - b) / 86_400_000)
}

/**
 * Which agenda group a reminder belongs to. A reminder that is still active and past its time is "overdue"
 * (even if it is later today); one that is finished or cancelled and in the past is "earlier". Later today
 * is "today"; the next six days are "this week".
 */
export function groupFor(dueMs: number, nowMs: number, active: boolean): DayGroup {
  if (dueMs < nowMs) return active ? 'overdue' : dayOffset(dueMs, nowMs) === 0 ? 'today' : 'earlier'
  const offset = dayOffset(dueMs, nowMs)
  if (offset <= 0) return 'today'
  if (offset === 1) return 'tomorrow'
  if (offset <= 6) return 'week'
  return 'later'
}

export interface Grouped<T> {
  group: DayGroup
  label: string
  items: T[]
}

/** Buckets items into agenda groups in display order, omitting empty groups. Order inside a group is kept. */
export function groupByDay<T>(
  items: readonly T[],
  nowMs: number,
  pick: (item: T) => { dueMs: number; active: boolean },
): Grouped<T>[] {
  const buckets = new Map<DayGroup, T[]>()
  for (const item of items) {
    const { dueMs, active } = pick(item)
    const group = groupFor(dueMs, nowMs, active)
    const list = buckets.get(group)
    if (list) list.push(item)
    else buckets.set(group, [item])
  }
  return GROUP_ORDER.flatMap((group) => {
    const list = buckets.get(group)
    return list ? [{ group, label: GROUP_LABELS[group], items: list }] : []
  })
}

const dayName = new Intl.DateTimeFormat(undefined, {
  weekday: 'short',
  day: 'numeric',
  month: 'short',
})
const timeOnly = new Intl.DateTimeFormat(undefined, { hour: 'numeric', minute: '2-digit' })

/** "Fri 27 Nov". */
export function formatDay(ms: number): string {
  return dayName.format(new Date(ms))
}

/** "9:00 am". */
export function formatTime(ms: number): string {
  return timeOnly.format(new Date(ms))
}

/** "Today, 9:00 am", "Tomorrow, 9:00 am", "Fri 27 Nov, 9:00 am". */
export function formatWhen(dueMs: number, nowMs: number): string {
  const offset = dayOffset(dueMs, nowMs)
  const day =
    offset === 0
      ? 'Today'
      : offset === 1
        ? 'Tomorrow'
        : offset === -1
          ? 'Yesterday'
          : formatDay(dueMs)
  return `${day}, ${formatTime(dueMs)}`
}
