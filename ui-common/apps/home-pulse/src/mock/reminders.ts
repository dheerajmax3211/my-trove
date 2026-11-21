import type { Reminder, ReminderType } from '../features/reminders/types'
import type { StoredAppliance } from './types'

const TYPE_ORDER: ReminderType[] = [
  'SERVICE_OVERDUE',
  'SERVICE_DUE',
  'WARRANTY_ENDING',
  'WARRANTY_CLAIM_WINDOW',
]

const DAY_MS = 86_400_000
const daysBetween = (from: string, to: string): number =>
  Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / DAY_MS)

/** The service's ReminderCalculator, ported line for line (same rules, same wording, same order). */
export function computeReminders(
  appliances: readonly StoredAppliance[],
  alerting: ReadonlySet<string>,
  today: string,
  horizonDays: number,
): Reminder[] {
  const out: Reminder[] = []
  for (const a of appliances) {
    const isAlerting = alerting.has(a.id)
    if (a.nextServiceDate) {
      const days = daysBetween(today, a.nextServiceDate)
      const tail = isAlerting ? ' and the appliance is showing an anomaly.' : '.'
      if (days < 0)
        out.push({
          applianceId: a.id,
          applianceName: a.name,
          type: 'SERVICE_OVERDUE',
          dueDate: a.nextServiceDate,
          daysUntil: days,
          highPriority: isAlerting,
          message: `Service was due ${-days} day(s) ago${tail}`,
        })
      else if (days <= horizonDays)
        out.push({
          applianceId: a.id,
          applianceName: a.name,
          type: 'SERVICE_DUE',
          dueDate: a.nextServiceDate,
          daysUntil: days,
          highPriority: isAlerting,
          message: `Service due in ${days} day(s)${tail}`,
        })
    }
    if (a.warrantyEndDate) {
      const days = daysBetween(today, a.warrantyEndDate)
      if (days >= 0 && isAlerting)
        out.push({
          applianceId: a.id,
          applianceName: a.name,
          type: 'WARRANTY_CLAIM_WINDOW',
          dueDate: a.warrantyEndDate,
          daysUntil: days,
          highPriority: true,
          message: `An anomaly was detected while the warranty is still valid (ends in ${days} day(s)): get it checked before it expires.`,
        })
      else if (days >= 0 && days <= horizonDays)
        out.push({
          applianceId: a.id,
          applianceName: a.name,
          type: 'WARRANTY_ENDING',
          dueDate: a.warrantyEndDate,
          daysUntil: days,
          highPriority: false,
          message: `Warranty ends in ${days} day(s).`,
        })
    }
  }
  return out.sort(
    (x, y) =>
      Number(y.highPriority) - Number(x.highPriority) ||
      x.daysUntil - y.daysUntil ||
      x.applianceName.localeCompare(y.applianceName) ||
      TYPE_ORDER.indexOf(x.type) - TYPE_ORDER.indexOf(y.type),
  )
}

export { daysBetween }
