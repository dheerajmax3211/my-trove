import type { TodayItem } from '@platform/workspace-kit'
import { describeAlert } from '../alerts/evidence'
import type { AlertDto, Severity } from '../alerts/types'
import type { Appliance } from '../appliances/types'
import { formatDaysUntil } from '../../lib/format'

/** Warranties ending within this many days are worth a line in "Today". */
export const WARRANTY_HORIZON_DAYS = 30
/** Services overdue, or due within this many days. */
export const SERVICE_HORIZON_DAYS = 14

const SEVERITY: Record<Severity, TodayItem['severity']> = {
  CRITICAL: 'danger',
  WARNING: 'warn',
  INFO: 'info',
}
const RANK: Record<TodayItem['severity'], number> = { danger: 0, warn: 1, info: 2 }

/**
 * What needs a person's eye today: open alerts (worst first), warranties ending soon, services overdue or due soon.
 * Day counts are the service's (`daysToWarrantyEnd`, `daysToNextService`), so the feed and the server agree on
 * what is overdue. Pure, so it can be tested with fixtures. `to` is relative to the module base.
 */
export function buildTodayItems(
  alerts: readonly AlertDto[],
  appliances: readonly Appliance[],
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
    const warrantyDays = appliance.daysToWarrantyEnd
    if (appliance.warrantyEndDate && appliance.underWarranty && warrantyDays !== null) {
      if (warrantyDays >= 0 && warrantyDays <= WARRANTY_HORIZON_DAYS) {
        items.push({
          id: `warranty-${appliance.id}`,
          title: `${appliance.name} warranty ends ${formatDaysUntil(warrantyDays)}`,
          subtitle: 'Claim now if something looks wrong',
          dueAt: appliance.warrantyEndDate,
          severity: warrantyDays <= 7 ? 'danger' : 'warn',
          to: `/appliances/${appliance.id}`,
        })
      }
    }
    const days = appliance.daysToNextService
    if (appliance.nextServiceDate && days !== null) {
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
