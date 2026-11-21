import { useAuth } from '@platform/auth-web'
import {
  Badge,
  Button,
  DataTable,
  EmptyState,
  PageHeader,
  PlusIcon,
  Tabs,
  TabsList,
  TabsTrigger,
  useToast,
  VisuallyHidden,
  type BadgeVariant,
  type DataTableColumn,
} from '@platform/ui'
import { useState } from 'react'
import { ConfirmDialog } from '../../../components/ConfirmDialog'
import { ErrorState } from '../../../components/ErrorState'
import { ScopeSelect, SCOPE_ALL, SCOPE_PERSONAL, scopeName } from '../../../components/ScopeSelect'
import { formatDateTime, formatRelative } from '../../../lib/format'
import { usePageTitle } from '../../../lib/usePageTitle'
import { useCoreEnv } from '../../../core/env'
import { useHouseholds } from '../../households/hooks'
import type { Household } from '../../households/types'
import { ReminderDialog } from '../components/ReminderDialog'
import { useCancelReminder, useReminders } from '../hooks'
import { describeRecurrence } from '../recurrence'
import type { Reminder, ReminderStatus } from '../types'

type StatusFilter = ReminderStatus | 'ALL'

const STATUS_BADGE: Record<ReminderStatus, { label: string; variant: BadgeVariant }> = {
  ACTIVE: { label: 'Active', variant: 'accent' },
  COMPLETED: { label: 'Completed', variant: 'success' },
  CANCELLED: { label: 'Cancelled', variant: 'neutral' },
}

const EMPTY_COPY: Record<StatusFilter, string> = {
  ACTIVE: 'Nothing is waiting. Add a reminder and it will show up here.',
  COMPLETED:
    'Reminders move here after they fire. One-off reminders complete; repeating ones keep going.',
  CANCELLED: 'Reminders you cancel are listed here.',
  ALL: 'Add your first reminder.',
}

/** Creators can change their own; household owners can change anyone's. Only active ones change. */
function canModify(reminder: Reminder, uid: string | undefined, households: readonly Household[]) {
  if (reminder.status !== 'ACTIVE') return false
  if (reminder.ownerUid === uid) return true
  return households.find((h) => h.id === reminder.householdId)?.role === 'OWNER'
}

export function RemindersPage() {
  usePageTitle('Reminders')
  const { user } = useAuth()
  const { toast } = useToast()
  const { now } = useCoreEnv()
  const households = useHouseholds()
  const [scope, setScope] = useState(SCOPE_ALL)
  const [status, setStatus] = useState<StatusFilter>('ACTIVE')
  const [dialog, setDialog] = useState<Reminder | 'new' | null>(null)
  const [cancelling, setCancelling] = useState<Reminder | null>(null)
  const cancel = useCancelReminder()

  const householdList = households.data ?? []
  const householdScope = scope !== SCOPE_ALL && scope !== SCOPE_PERSONAL ? scope : undefined
  const reminders = useReminders({
    ...(householdScope ? { householdId: householdScope } : {}),
    ...(status !== 'ALL' ? { status } : {}),
  })
  const rows = (reminders.data ?? []).filter(
    (r) => scope !== SCOPE_PERSONAL || r.householdId === null,
  )

  const columns: DataTableColumn<Reminder>[] = [
    {
      id: 'title',
      header: 'Reminder',
      sortValue: (r) => r.title,
      cell: (r) => <strong>{r.title}</strong>,
    },
    {
      id: 'due',
      header: 'Due',
      sortValue: (r) => r.dueAt,
      cell: (r) => (
        <span className="hub-stack-sm" style={{ gap: 2 }}>
          <span>{formatDateTime(r.dueAt)}</span>
          <span className="hub-muted">
            {r.status === 'ACTIVE' && new Date(r.dueAt).getTime() < now() ? 'Overdue, ' : ''}
            {formatRelative(r.dueAt, now())}
          </span>
        </span>
      ),
    },
    { id: 'repeats', header: 'Repeats', cell: (r) => describeRecurrence(r.recurrence) },
    {
      id: 'scope',
      header: 'For',
      sortValue: (r) => scopeName(r.householdId, householdList),
      cell: (r) => scopeName(r.householdId, householdList),
    },
    {
      id: 'status',
      header: 'Status',
      sortValue: (r) => r.status,
      cell: (r) => (
        <Badge variant={STATUS_BADGE[r.status].variant} dot>
          {STATUS_BADGE[r.status].label}
        </Badge>
      ),
    },
    {
      id: 'actions',
      header: <VisuallyHidden>Actions</VisuallyHidden>,
      headerLabel: 'Actions',
      align: 'end',
      cell: (r) =>
        canModify(r, user?.uid, householdList) ? (
          <span className="hub-row">
            <Button
              size="sm"
              variant="ghost"
              aria-label={`Edit ${r.title}`}
              onClick={() => setDialog(r)}
            >
              Edit
            </Button>
            <Button
              size="sm"
              variant="ghost"
              aria-label={`Cancel ${r.title}`}
              onClick={() => setCancelling(r)}
            >
              Cancel
            </Button>
          </span>
        ) : null,
    },
  ]

  return (
    <>
      <PageHeader
        eyebrow="Reminders"
        title="Reminders"
        description="When a reminder falls due we notify you. One-off reminders then show as completed; repeating ones move to their next date."
        actions={
          <Button leftIcon={<PlusIcon size={18} />} onClick={() => setDialog('new')}>
            New reminder
          </Button>
        }
      />
      <div className="hub-stack">
        <div className="hub-toolbar">
          <ScopeSelect
            label="Show reminders for"
            value={scope}
            onChange={setScope}
            households={householdList}
            includeAll
          />
          <Tabs value={status} onValueChange={(v) => setStatus(v as StatusFilter)}>
            <TabsList aria-label="Filter by status">
              <TabsTrigger value="ACTIVE">Active</TabsTrigger>
              <TabsTrigger value="COMPLETED">Completed</TabsTrigger>
              <TabsTrigger value="CANCELLED">Cancelled</TabsTrigger>
              <TabsTrigger value="ALL">All</TabsTrigger>
            </TabsList>
          </Tabs>
        </div>

        {reminders.isError ? (
          <ErrorState error={reminders.error} onRetry={() => void reminders.refetch()} />
        ) : (
          <DataTable
            caption="Reminders"
            columns={columns}
            data={rows}
            getRowId={(r) => r.id}
            loading={reminders.isPending}
            defaultSort={{ columnId: 'due', direction: 'asc' }}
            emptyState={
              <EmptyState
                headingAs="h2"
                title="No reminders here"
                description={EMPTY_COPY[status]}
                action={<Button onClick={() => setDialog('new')}>New reminder</Button>}
              />
            }
          />
        )}
      </div>

      <ReminderDialog target={dialog} households={householdList} onClose={() => setDialog(null)} />
      <ConfirmDialog
        open={cancelling !== null}
        onOpenChange={(open) => {
          if (!open) {
            setCancelling(null)
            cancel.reset()
          }
        }}
        title="Cancel this reminder?"
        description={
          cancelling
            ? `"${cancelling.title}" will not fire again. It stays in your Cancelled list.`
            : ''
        }
        confirmLabel="Cancel reminder"
        cancelLabel="Keep reminder"
        pending={cancel.isPending}
        error={cancel.error}
        onConfirm={() => {
          if (!cancelling) return
          cancel.mutate(
            { id: cancelling.id },
            {
              onSuccess: () => {
                toast({
                  title: 'Reminder cancelled',
                  description: cancelling.title,
                  variant: 'success',
                })
                setCancelling(null)
              },
            },
          )
        }}
      />
    </>
  )
}
