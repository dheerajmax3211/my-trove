import type { Recurrence } from './types'

/** "Every day", "Every 2 weeks", "Every 3 months". `null` means a one-off reminder. */
export function describeRecurrence(recurrence: Recurrence | null): string {
  if (!recurrence) return 'Does not repeat'
  const { unit, interval } = recurrence
  const noun = { DAILY: 'day', WEEKLY: 'week', MONTHLY: 'month' }[unit]
  return interval === 1 ? `Every ${noun}` : `Every ${interval} ${noun}s`
}
