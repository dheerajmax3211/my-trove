import type { Reminder, ReminderType } from './types'

const TYPE_ORDER: ReminderType[] = [
  'SERVICE_OVERDUE',
  'SERVICE_DUE',
  'WARRANTY_ENDING',
  'WARRANTY_CLAIM_WINDOW',
]

export const REMINDER_LABELS: Record<ReminderType, string> = {
  SERVICE_OVERDUE: 'Service overdue',
  SERVICE_DUE: 'Service due',
  WARRANTY_ENDING: 'Warranty ending',
  WARRANTY_CLAIM_WINDOW: 'Claim window',
}

/** The service's order, applied again here so it holds whatever order a response arrives in: priority, soonest, name. */
export function sortReminders(reminders: readonly Reminder[]): Reminder[] {
  return [...reminders].sort(
    (a, b) =>
      Number(b.highPriority) - Number(a.highPriority) ||
      a.daysUntil - b.daysUntil ||
      a.applianceName.localeCompare(b.applianceName) ||
      TYPE_ORDER.indexOf(a.type) - TYPE_ORDER.indexOf(b.type),
  )
}
