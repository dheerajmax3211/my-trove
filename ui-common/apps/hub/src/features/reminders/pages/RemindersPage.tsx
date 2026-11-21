import {
  Badge,
  Button,
  EmptyState,
  IllustrationLetter,
  PageHeader,
  PlusIcon,
  Skeleton,
  Tabs,
  TabsList,
  TabsTrigger,
  useToast,
  type BadgeVariant,
} from '@platform/ui'
import { useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { ConfirmDialog } from '../../../components/ConfirmDialog'
import { ErrorState } from '../../../components/ErrorState'
import { ScopeSelect, SCOPE_ALL, SCOPE_PERSONAL, scopeName } from '../../../components/ScopeSelect'
import { useCoreEnv } from '../../../core/env'
import { usePeople } from '../../../core/people'
import { formatDay, formatTime, groupByDay, type DayGroup } from '../../../lib/day'
import { usePageTitle } from '../../../lib/usePageTitle'
import { useHouseholds } from '../../households/hooks'
import type { Household } from '../../households/types'
import { QuickAdd } from '../components/QuickAdd'
import { ReminderDialog } from '../components/ReminderDialog'
import { useCancelReminder, useReminders } from '../hooks'
import { describeRecurrence } from '../recurrence'
import type { Reminder, ReminderStatus } from '../types'
import styles from './Reminders.module.css'

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

/** Today and tomorrow need only the time; further out the day matters too. */
function whenLabel(group: DayGroup, ms: number): string {
  return group === 'today' || group === 'tomorrow'
    ? formatTime(ms)
    : `${formatDay(ms)}, ${formatTime(ms)}`
}

export function RemindersPage() {
  usePageTitle('Reminders')
  const people = usePeople()
  const { toast } = useToast()
  const { now } = useCoreEnv()
  const households = useHouseholds()
  const [params] = useSearchParams()
  const [scope, setScope] = useState(params.get('household') ?? SCOPE_ALL)
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
  const rows = (reminders.data ?? [])
    .filter((r) => scope !== SCOPE_PERSONAL || r.householdId === null)
    .sort((a, b) => a.dueAt.localeCompare(b.dueAt))
  const nowMs = now()
  const groups = groupByDay(rows, nowMs, (r) => ({
    dueMs: new Date(r.dueAt).getTime(),
    active: r.status === 'ACTIVE',
  }))
  // The agenda reads soonest first; what is already finished reads newest first.
  const earlier = groups.find((g) => g.group === 'earlier')
  if (earlier) earlier.items.reverse()

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
        <QuickAdd households={householdList} defaultScope={householdScope} />
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
        ) : reminders.isPending ? (
          <div className="hub-stack-sm" aria-busy="true" aria-label="Loading reminders">
            <Skeleton height={56} />
            <Skeleton height={56} />
            <Skeleton height={56} />
          </div>
        ) : groups.length === 0 ? (
          <EmptyState
            illustration={<IllustrationLetter />}
            headingAs="h2"
            title="No reminders here"
            description={EMPTY_COPY[status]}
            action={<Button onClick={() => setDialog('new')}>New reminder</Button>}
          />
        ) : (
          <div className={styles.agenda}>
            {groups.map((g) => (
              <section key={g.group} aria-labelledby={`agenda-${g.group}`} className={styles.day}>
                <h2
                  id={`agenda-${g.group}`}
                  className={g.group === 'overdue' ? styles.dayLate : styles.dayTitle}
                >
                  {g.label}
                  <span className={styles.count}>{g.items.length}</span>
                </h2>
                <ul className={styles.items}>
                  {g.items.map((r) => {
                    const dueMs = new Date(r.dueAt).getTime()
                    return (
                      <li key={r.id} className={styles.item}>
                        <span className={styles.time}>{whenLabel(g.group, dueMs)}</span>
                        <div className={styles.body}>
                          <span className={styles.title}>{r.title}</span>
                          <span className={styles.meta}>
                            {scopeName(r.householdId, householdList)}
                            {r.recurrence ? `, ${describeRecurrence(r.recurrence)}` : ''}
                            {r.householdId && r.ownerUid !== people.selfUid
                              ? `, added by ${people.nameOf(r.ownerUid)}`
                              : ''}
                          </span>
                        </div>
                        {r.status !== 'ACTIVE' ? (
                          <Badge variant={STATUS_BADGE[r.status].variant} dot>
                            {STATUS_BADGE[r.status].label}
                          </Badge>
                        ) : null}
                        {canModify(r, people.selfUid, householdList) ? (
                          <span className={styles.actions}>
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
                        ) : null}
                      </li>
                    )
                  })}
                </ul>
              </section>
            ))}
          </div>
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
