import { Button, EmptyState, PageHeader, Skeleton } from '@platform/ui'
import { Link } from 'react-router-dom'
import { ErrorState } from '../../../components/ErrorState'
import { useDocumentTitle } from '../../../lib/useDocumentTitle'
import { ReminderItem } from '../components/ReminderItem'
import { REMINDER_HORIZON_DAYS, useReminders } from '../hooks'
import { sortReminders } from '../sort'

export function RemindersPage() {
  useDocumentTitle('Reminders')
  const reminders = useReminders()

  return (
    <>
      <PageHeader
        title="Reminders"
        description={`Services and warranties coming up in the next ${REMINDER_HORIZON_DAYS} days, most important first. An anomaly on an appliance that is still under warranty comes first, because that is when a claim is easiest.`}
      />
      {reminders.isPending ? (
        <div className="stack-3" role="status" aria-busy="true" aria-label="Loading reminders">
          <Skeleton height="4rem" />
          <Skeleton height="4rem" />
        </div>
      ) : reminders.isError ? (
        <ErrorState
          title="Could not load reminders"
          error={reminders.error}
          onRetry={() => void reminders.refetch()}
        />
      ) : reminders.data.length === 0 ? (
        <EmptyState
          title="Nothing due soon"
          description="Add service and warranty dates to your appliances and we will remind you before they matter."
          action={
            <Button variant="secondary" asChild>
              <Link to="/">Go to your appliances</Link>
            </Button>
          }
        />
      ) : (
        <ol className="stack-3 plain-list reminder-list" aria-label="Reminders by priority">
          {sortReminders(reminders.data).map((reminder) => (
            <li key={`${reminder.applianceId}-${reminder.type}`}>
              <ReminderItem reminder={reminder} />
            </li>
          ))}
        </ol>
      )}
    </>
  )
}
