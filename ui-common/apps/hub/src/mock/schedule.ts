import type { Recurrence } from '../features/reminders/types'

const DAY_MS = 86_400_000

function addMonthsUtc(anchorMs: number, months: number): number {
  const a = new Date(anchorMs)
  const first = new Date(Date.UTC(a.getUTCFullYear(), a.getUTCMonth() + months, 1))
  const daysInMonth = new Date(
    Date.UTC(first.getUTCFullYear(), first.getUTCMonth() + 1, 0),
  ).getUTCDate()
  return Date.UTC(
    first.getUTCFullYear(),
    first.getUTCMonth(),
    Math.min(a.getUTCDate(), daysInMonth),
    a.getUTCHours(),
    a.getUTCMinutes(),
    a.getUTCSeconds(),
    a.getUTCMilliseconds(),
  )
}

/**
 * Port of shared-service `Recurrence.nextAfter`: the first occurrence aligned to `anchorMs`
 * (computed in UTC, so a monthly rule on the 31st does not drift) that is strictly after `afterMs`.
 */
export function nextOccurrenceAfter(
  recurrence: Recurrence,
  anchorMs: number,
  afterMs: number,
): number {
  const { unit, interval } = recurrence
  const at = (k: number): number =>
    unit === 'MONTHLY'
      ? addMonthsUtc(anchorMs, k * interval)
      : anchorMs + k * interval * (unit === 'WEEKLY' ? 7 : 1) * DAY_MS
  const smallestStepMs = interval * (unit === 'WEEKLY' ? 7 : unit === 'DAILY' ? 1 : 28) * DAY_MS
  let k = Math.max(Math.floor((afterMs - anchorMs) / smallestStepMs) - 1, 0)
  while (at(k) <= afterMs) k += 1
  return at(k)
}
