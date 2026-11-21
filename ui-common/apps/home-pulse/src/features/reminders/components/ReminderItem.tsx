import { Badge } from '@platform/ui'
import { Link } from 'react-router-dom'
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
    <div className="reminder">
      <div className="badge-row">
        {reminder.highPriority ? (
          <Badge variant="danger" dot>
            High priority
          </Badge>
        ) : null}
        <Badge variant={reminder.daysUntil < 0 ? 'warning' : 'neutral'}>
          {REMINDER_LABELS[reminder.type]}
        </Badge>
        <span className="muted small">
          {formatDate(reminder.dueDate)} ({formatDaysUntil(reminder.daysUntil)})
        </span>
      </div>
      <p>
        {showAppliance ? (
          <>
            <Link to={`/appliances/${reminder.applianceId}`}>
              <strong>{reminder.applianceName}</strong>
            </Link>
            {': '}
          </>
        ) : null}
        {reminder.message}
      </p>
    </div>
  )
}
