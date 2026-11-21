import type { TodayItem } from '@platform/workspace-kit'
import { describeAlert } from '../alerts/evidence'
import type { AlertDto, Severity } from '../alerts/types'
import type { Appliance } from '../appliances/types'
import { formatDaysUntil } from '../../lib/format'

/** Warranties ending within this many days are worth a line in "Today". */
export const WARRANTY_HORIZON_DAYS = 30
/** Services overdue, or due within this many days. */
export const SERVICE_HORIZON_DAYS = 14

const DAY_MS = 24 * 60 * 60_000

const SEVERITY: Record<Severity, TodayItem['severity']> = {
  CRITICAL: 'danger',
  WARNING: 'warn',
  INFO: 'info',
}
const RANK: Record<TodayItem['severity'], number> = { danger: 0, warn: 1, info: 2 }

/** Whole days from `now` (its UTC calendar day) to a `YYYY-MM-DD` date; negative when past. */
function daysUntil(date: string, now: Date): number {
  const today = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())
  const [y, m, d] = date.split('-').map(Number)
  return Math.round((Date.UTC(y ?? 0, (m ?? 1) - 1, d ?? 1) - today) / DAY_MS)
}

/**
 * What needs a person's eye today: open alerts (worst first), warranties ending soon, services overdue or due soon.
 * Pure, so it can be tested with fixtures. `to` is relative to the module base.
 */
export function buildTodayItems(
  alerts: readonly AlertDto[],
  appliances: readonly Appliance[],
  now: Date,
): TodayItem[] {
  const items: TodayItem[] = []

  for (const alert of alerts) {
    if (alert.status !== 'OPEN') continue
    items.push({
      id: `alert-${alert.id}`,
      title: describeAlert(alert).headline,
      subtitle: `${alert.applianceName}. Open alert`,
      dueAt: alert.openedAt,
      severity: SEVERITY[alert.severity],
      to: `/appliances/${alert.applianceId}`,
    })
  }

  for (const appliance of appliances) {
    if (appliance.warrantyEndDate && appliance.underWarranty) {
      const days = appliance.daysToWarrantyEnd ?? daysUntil(appliance.warrantyEndDate, now)
      if (days >= 0 && days <= WARRANTY_HORIZON_DAYS) {
        items.push({
          id: `warranty-${appliance.id}`,
          title: `${appliance.name} warranty ends ${formatDaysUntil(days)}`,
          subtitle: 'Claim now if something looks wrong',
          dueAt: appliance.warrantyEndDate,
          severity: days <= 7 ? 'danger' : 'warn',
          to: `/appliances/${appliance.id}`,
        })
      }
    }
    if (appliance.nextServiceDate) {
      const days = daysUntil(appliance.nextServiceDate, now)
      if (days < 0 || appliance.serviceOverdue) {
        items.push({
          id: `service-${appliance.id}`,
          title: `${appliance.name} service is overdue`,
          subtitle: formatDaysUntil(days),
          dueAt: appliance.nextServiceDate,
          severity: 'warn',
          to: `/appliances/${appliance.id}`,
        })
      } else if (days <= SERVICE_HORIZON_DAYS) {
        items.push({
          id: `service-${appliance.id}`,
          title: `${appliance.name} service is due ${formatDaysUntil(days)}`,
          dueAt: appliance.nextServiceDate,
          severity: 'info',
          to: `/appliances/${appliance.id}`,
        })
      }
    }
  }

  return items.sort(
    (a, b) =>
      RANK[a.severity] - RANK[b.severity] ||
      (a.dueAt ?? '').localeCompare(b.dueAt ?? '') ||
      a.id.localeCompare(b.id),
  )
}
