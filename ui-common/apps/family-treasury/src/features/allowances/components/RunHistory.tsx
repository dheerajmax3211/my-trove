import {
  Badge,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  DataTable,
  type BadgeVariant,
  type DataTableColumn,
} from '@platform/ui'
import type { AllowanceRun, RunStatus, ScheduleView } from '../../../api/types'
import { QueryState } from '../../../components/QueryState'
import { formatCalendarDate } from '../../../lib/dates'
import { useHousehold } from '../../household/hooks/useHousehold'
import { useRuns } from '../hooks'

const STATUS: Record<RunStatus, { label: string; variant: BadgeVariant; why: string }> = {
  PAID: { label: 'Paid', variant: 'success', why: 'Paid into the pot.' },
  SKIPPED: {
    label: 'Skipped',
    variant: 'warning',
    why: 'This period was missed. Policy: when several periods are due at once, only the latest is paid and earlier ones are never paid back.',
  },
  FAILED: {
    label: 'Failed',
    variant: 'danger',
    why: 'The payment could not be made, usually because the source account did not have enough. It is not retried.',
  },
}

export function RunHistory({ schedule }: { schedule: ScheduleView }) {
  const h = useHousehold()
  const runs = useRuns(h.household.id, schedule.id)
  const columns: DataTableColumn<AllowanceRun>[] = [
    { id: 'period', header: 'Period starting', cell: (r) => formatCalendarDate(r.periodStart) },
    {
      id: 'status',
      header: 'Result',
      cell: (r) => (
        <Badge variant={STATUS[r.status]?.variant ?? 'neutral'}>
          {STATUS[r.status]?.label ?? r.status}
        </Badge>
      ),
    },
    { id: 'why', header: 'Reason', cell: (r) => STATUS[r.status]?.why ?? '' },
  ]
  return (
    <Card>
      <CardHeader>
        <CardTitle as="h2">Run history: {schedule.description}</CardTitle>
      </CardHeader>
      <CardContent>
        <QueryState
          query={runs}
          loadingLabel="Loading run history"
          errorTitle="We could not load the run history"
        >
          {(list) => (
            <DataTable
              caption={`Run history for ${schedule.description}`}
              columns={columns}
              data={[...list].reverse()}
              getRowId={(r) => r.periodStart}
              emptyState={
                <p>
                  No periods have run yet. The first payment is on{' '}
                  {formatCalendarDate(schedule.startDate)}.
                </p>
              }
            />
          )}
        </QueryState>
      </CardContent>
    </Card>
  )
}
