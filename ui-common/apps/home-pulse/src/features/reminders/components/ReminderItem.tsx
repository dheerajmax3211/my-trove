import { Badge } from '@platform/ui'
import { ModuleLink } from '@platform/workspace-kit'
import { formatDate, formatDaysUntil } from '../../../lib/format'
import { REMINDER_LABELS } from '../sort'
import type { Reminder, ReminderSource } from '../types'

/** Where each reminder comes from, in the owner's own terms. The service says which record applies (reminder.source). */
export const REMINDER_SOURCES: Record<ReminderSource, string> = {
  SERVICE_DATE: 'From the next service date you entered on the appliance.',
  WARRANTY_DATE: 'From the warranty end date you entered on the appliance.',
  ALERT:
    'From a live anomaly alert on the appliance, measured against the warranty end date you entered.',
}

export function ReminderItem({
  reminder,
  showAppliance = true,
}: {
  reminder: Reminder
  showAppliance?: boolean
}) {
  return (
    <div
      className="hp-reminder"
      data-priority={reminder.highPriority ? 'high' : 'normal'}
      data-source={reminder.source}
    >
      <div className="hp-badge-row">
        {reminder.highPriority ? (
          <Badge variant="danger" dot>
            High priority
          </Badge>
        ) : null}
        <Badge variant={reminder.daysUntil < 0 ? 'warning' : 'neutral'}>
          {REMINDER_LABELS[reminder.type]}
        </Badge>
        <span className="hp-muted hp-small">
          {formatDate(reminder.dueDate)} ({formatDaysUntil(reminder.daysUntil)})
        </span>
      </div>
      <p>
        {showAppliance ? (
          <>
            <ModuleLink to={`/appliances/${reminder.applianceId}`}>
              <strong>{reminder.applianceName}</strong>
            </ModuleLink>
            {': '}
          </>
        ) : null}
        {reminder.message}
      </p>
      <p className="hp-muted hp-small" data-testid="reminder-source">
        {REMINDER_SOURCES[reminder.source]}
      </p>
    </div>
  )
}
