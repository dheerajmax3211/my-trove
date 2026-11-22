import { Button, EmptyState, Illustration, PageHeader, Skeleton } from '@platform/ui'
import { ModuleLink } from '@platform/workspace-kit'
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
        description={`Services and warranties coming up in the next ${REMINDER_HORIZON_DAYS} days, most important first. Reminders come only from the service and warranty dates you enter on each appliance, plus a live alert on an appliance still under warranty, which comes first because that is when a claim is easiest.`}
      />
      {reminders.isPending ? (
        <div className="hp-stack-3" role="status" aria-busy="true" aria-label="Loading reminders">
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
          illustration={<Illustration name="allClear" />}
          title="Nothing due soon"
          description="Add service and warranty dates to your appliances and we will remind you before they matter."
          action={
            <Button variant="secondary" asChild>
              <ModuleLink to="/">Go to your appliances</ModuleLink>
            </Button>
          }
        />
      ) : (
        <ol
          className="hp-stack-3 hp-plain-list hp-reminder-list"
          aria-label="Reminders by priority"
        >
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
