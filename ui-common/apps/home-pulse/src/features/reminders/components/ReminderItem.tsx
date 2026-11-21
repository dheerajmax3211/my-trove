import { Badge } from '@platform/ui'
import { ModuleLink } from '@platform/workspace-kit'
import { formatDate, formatDaysUntil } from '../../../lib/format'
import { REMINDER_LABELS } from '../sort'
import type { Reminder } from '../types'

export function ReminderItem({
  reminder,
  showAppliance = true,
}: {
  reminder: Reminder
  showAppliance?: boolean
}) {
  return (
    <div className="hp-reminder" data-priority={reminder.highPriority ? 'high' : 'normal'}>
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
    </div>
  )
}
