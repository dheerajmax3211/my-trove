import { useAuth } from '@platform/auth-web'
import {
  DataTable,
  EmptyState,
  Field,
  PageHeader,
  Select,
  type DataTableColumn,
} from '@platform/ui'
import { useSearchParams } from 'react-router-dom'
import { ErrorState } from '../../../components/ErrorState'
import { MemberLabel } from '../../../components/MemberLabel'
import { Pager } from '../../../components/Pager'
import { ScopeSelect, SCOPE_PERSONAL } from '../../../components/ScopeSelect'
import { formatDateTime } from '../../../lib/format'
import { usePageTitle } from '../../../lib/usePageTitle'
import { useHouseholds } from '../../households/hooks'
import { ACTION_LABELS, actionLabel, describeDetails } from '../describe'
import { useAudit } from '../hooks'
import type { AuditEvent } from '../types'

const PAGE_SIZE = 20

export function ActivityPage() {
  usePageTitle('Activity')
  const { user } = useAuth()
  const households = useHouseholds()
  const [params, setParams] = useSearchParams()
  const householdId = params.get('household') ?? undefined
  const action = params.get('action') ?? ''
  const page = Math.max(Number.parseInt(params.get('page') ?? '0', 10) || 0, 0)
  const audit = useAudit({ ...(householdId ? { householdId } : {}), action, page, size: PAGE_SIZE })

  /** Replaces some params and keeps the rest; changing scope or filter goes back to page 1. */
  const update = (changes: Record<string, string | null>) =>
    setParams((current) => {
      const next = new URLSearchParams(current)
      for (const [key, value] of Object.entries(changes)) {
        if (value) next.set(key, value)
        else next.delete(key)
      }
      return next
    })

  const columns: DataTableColumn<AuditEvent>[] = [
    { id: 'when', header: 'When', cell: (e) => formatDateTime(e.createdAt) },
    {
      id: 'who',
      header: 'Who',
      cell: (e) => <MemberLabel uid={e.actorUid} currentUid={user?.uid} />,
    },
    { id: 'what', header: 'What', cell: (e) => <strong>{actionLabel(e.action)}</strong> },
    {
      id: 'details',
      header: 'Details',
      cell: (e) => <span className="hub-muted">{describeDetails(e) || e.subjectType}</span>,
    },
  ]

  return (
    <>
      <PageHeader
        eyebrow="Activity"
        title="Activity"
        description="An append-only record of what happened, newest first. It cannot be edited or deleted."
      />
      <div className="hub-stack">
        <div className="hub-toolbar">
          <ScopeSelect
            label="Whose activity"
            value={householdId ?? SCOPE_PERSONAL}
            onChange={(value) =>
              update({ household: value === SCOPE_PERSONAL ? null : value, page: null })
            }
            households={households.data ?? []}
          />
          <Field label="Kind of event">
            <Select
              value={action}
              onChange={(e) => update({ action: e.target.value || null, page: null })}
            >
              <option value="">All events</option>
              {Object.entries(ACTION_LABELS).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </Select>
          </Field>
        </div>

        {audit.isError ? (
          <ErrorState error={audit.error} onRetry={() => void audit.refetch()} />
        ) : (
          <>
            <DataTable
              caption="Activity"
              columns={columns}
              data={audit.data?.items ?? []}
              getRowId={(e) => e.id}
              loading={audit.isPending}
              emptyState={
                <EmptyState
                  headingAs="h2"
                  title="No activity to show"
                  description={
                    action
                      ? 'No events of that kind yet. Choose "All events" to see everything.'
                      : householdId
                        ? 'Nothing has happened in this household yet.'
                        : 'Personal reminders and files you add will be recorded here. Choose a household to see shared activity.'
                  }
                />
              }
            />
            {audit.data ? (
              <Pager
                page={page}
                size={PAGE_SIZE}
                total={audit.data.total}
                onPageChange={(next) => update({ page: next === 0 ? null : String(next) })}
              />
            ) : null}
          </>
        )}
      </div>
    </>
  )
}
