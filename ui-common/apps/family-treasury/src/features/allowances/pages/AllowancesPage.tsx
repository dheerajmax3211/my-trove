import {
  Badge,
  Button,
  DataTable,
  EmptyState,
  PageHeader,
  PlusIcon,
  useToast,
  type DataTableColumn,
} from '@platform/ui'
import { useState } from 'react'
import { useGuardedMutation } from '../../../api/hooks'
import type { ScheduleView } from '../../../api/types'
import { AccessNotice } from '../../../components/AccessNotice'
import { ConfirmDialog } from '../../../components/ConfirmDialog'
import { ErrorNotice } from '../../../components/ErrorNotice'
import { MoneyText } from '../../../components/MoneyText'
import { QueryState } from '../../../components/QueryState'
import { formatCalendarDate } from '../../../lib/dates'
import { useHousehold } from '../../household/hooks/useHousehold'
import { CreateScheduleDialog } from '../components/CreateScheduleDialog'
import { RunHistory } from '../components/RunHistory'
import { useSchedules } from '../hooks'

function PauseDialog({ schedule, onClose }: { schedule: ScheduleView; onClose: () => void }) {
  const h = useHousehold()
  const { toast } = useToast()
  const { mutation, submit } = useGuardedMutation<void, void>({
    run: (api) => api.pauseSchedule(h.household.id, schedule.id),
    householdId: h.household.id,
    onSuccess: () => {
      toast({ title: 'Allowance paused', variant: 'success' })
      onClose()
    },
  })
  return (
    <ConfirmDialog
      title="Pause this allowance?"
      description={`"${schedule.description}" will stop paying. The service has no resume: to start again you create a new schedule. Past payments stay in the history.`}
      confirmLabel="Pause allowance"
      variant="danger"
      loading={mutation.isPending}
      onCancel={onClose}
      onConfirm={() => submit()}
    >
      {mutation.error ? <ErrorNotice error={mutation.error} /> : null}
    </ConfirmDialog>
  )
}

export function AllowancesPage() {
  const h = useHousehold()
  const schedules = useSchedules(h.household.id, h.trusted)
  const [creating, setCreating] = useState(false)
  const [pausing, setPausing] = useState<ScheduleView | null>(null)
  const [historyFor, setHistoryFor] = useState<string | null>(null)
  const isOwner = h.role === 'OWNER'

  if (!h.trusted) return <AccessNotice what="Allowances" to={`/h/${h.household.id}`} />

  return (
    <>
      <PageHeader
        title="Allowances"
        description="Weekly or monthly payments from the shared pool into a pot. Periods are evaluated in UTC."
        actions={
          isOwner ? (
            <Button leftIcon={<PlusIcon />} onClick={() => setCreating(true)}>
              New allowance
            </Button>
          ) : undefined
        }
      />
      <QueryState
        query={schedules}
        loadingLabel="Loading allowances"
        errorTitle="We could not load the allowances"
      >
        {(list) => {
          const columns: DataTableColumn<ScheduleView>[] = [
            {
              id: 'who',
              header: 'For',
              cell: (s) => <strong>{h.accountName(s.toAccountId)}</strong>,
            },
            { id: 'what', header: 'Description', cell: (s) => s.description },
            {
              id: 'amount',
              header: 'Amount',
              align: 'end',
              cell: (s) => <MoneyText minor={s.amountMinor} currency={s.currency} />,
            },
            {
              id: 'freq',
              header: 'How often',
              cell: (s) => (s.frequency === 'WEEKLY' ? 'Weekly' : 'Monthly'),
            },
            {
              id: 'next',
              header: 'Next run',
              cell: (s) => (s.active ? formatCalendarDate(s.nextDueOn) : 'Not scheduled'),
            },
            {
              id: 'status',
              header: 'Status',
              cell: (s) => (
                <Badge variant={s.active ? 'success' : 'neutral'} dot>
                  {s.active ? 'Active' : 'Paused'}
                </Badge>
              ),
            },
            {
              id: 'actions',
              header: 'Actions',
              cell: (s) => (
                <div className="ft-actions">
                  <Button
                    size="sm"
                    variant="secondary"
                    aria-label={`Run history for ${s.description}`}
                    onClick={() => setHistoryFor(historyFor === s.id ? null : s.id)}
                  >
                    {historyFor === s.id ? 'Hide history' : 'History'}
                  </Button>
                  {isOwner && s.active ? (
                    <Button
                      size="sm"
                      variant="ghost"
                      aria-label={`Pause ${s.description}`}
                      onClick={() => setPausing(s)}
                    >
                      Pause
                    </Button>
                  ) : null}
                </div>
              ),
            },
          ]
          const selected = list.find((s) => s.id === historyFor)
          return (
            <>
              <DataTable
                caption="Allowance schedules"
                columns={columns}
                data={list}
                getRowId={(s) => s.id}
                emptyState={
                  <EmptyState
                    title="No allowances yet"
                    description="Create a schedule and the kid's pot is topped up automatically."
                    action={
                      isOwner ? (
                        <Button onClick={() => setCreating(true)}>New allowance</Button>
                      ) : (
                        <p>Only the owner can create schedules.</p>
                      )
                    }
                  />
                }
              />
              {selected ? <RunHistory schedule={selected} /> : null}
            </>
          )
        }}
      </QueryState>
      {creating ? <CreateScheduleDialog onClose={() => setCreating(false)} /> : null}
      {pausing ? <PauseDialog schedule={pausing} onClose={() => setPausing(null)} /> : null}
    </>
  )
}
