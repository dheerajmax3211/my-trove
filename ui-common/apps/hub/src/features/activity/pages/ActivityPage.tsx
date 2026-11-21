import {
  EmptyState,
  Field,
  IllustrationSearch,
  PageHeader,
  Select,
  Skeleton,
  Timeline,
  type TimelineItem,
} from '@platform/ui'
import { useSearchParams } from 'react-router-dom'
import { ErrorState } from '../../../components/ErrorState'
import { Pager } from '../../../components/Pager'
import { ScopeSelect, SCOPE_PERSONAL } from '../../../components/ScopeSelect'
import { useCoreEnv } from '../../../core/env'
import { usePeople } from '../../../core/people'
import { dayOffset, formatDay, formatTime } from '../../../lib/day'
import { usePageTitle } from '../../../lib/usePageTitle'
import { useHouseholds } from '../../households/hooks'
import { ACTION_LABELS } from '../describe'
import { useAudit } from '../hooks'
import { KindIcon } from '../KindIcon'
import { describeEvent } from '../sentence'
import type { AuditEvent } from '../types'
import styles from './Activity.module.css'

const PAGE_SIZE = 20

function dayLabel(ms: number, nowMs: number): string {
  const offset = dayOffset(ms, nowMs)
  if (offset === 0) return 'Today'
  if (offset === -1) return 'Yesterday'
  return formatDay(ms)
}

/** Events arrive newest first; this keeps that order and starts a new group when the calendar day changes. */
export function groupEventsByDay(
  events: readonly AuditEvent[],
  nowMs: number,
): Array<{ label: string; events: AuditEvent[] }> {
  const groups: Array<{ label: string; events: AuditEvent[] }> = []
  for (const event of events) {
    const label = dayLabel(new Date(event.createdAt).getTime(), nowMs)
    const last = groups[groups.length - 1]
    if (last && last.label === label) last.events.push(event)
    else groups.push({ label, events: [event] })
  }
  return groups
}

export function ActivityPage() {
  usePageTitle('Activity')
  const people = usePeople()
  const { now } = useCoreEnv()
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

  const nowMs = now()
  const groups = groupEventsByDay(audit.data?.items ?? [], nowMs)
  const toItem = (event: AuditEvent): TimelineItem => {
    const sentence = describeEvent(event, people.nameOf)
    const when = new Date(event.createdAt).getTime()
    return {
      id: event.id,
      title: sentence.title,
      ...(sentence.description ? { description: sentence.description } : {}),
      time: formatTime(when),
      dateTime: event.createdAt,
      tone: sentence.tone,
      icon: <KindIcon kind={sentence.kind} />,
    }
  }

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
        ) : audit.isPending ? (
          <div className="hub-stack-sm" aria-busy="true" aria-label="Loading activity">
            <Skeleton height={48} />
            <Skeleton height={48} />
            <Skeleton height={48} />
          </div>
        ) : groups.length === 0 ? (
          <EmptyState
            illustration={<IllustrationSearch />}
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
        ) : (
          <>
            <div className={styles.days}>
              {groups.map((g) => (
                <section key={g.label} aria-label={g.label} className={styles.day}>
                  <h2 className={styles.dayTitle}>{g.label}</h2>
                  <Timeline items={g.events.map(toItem)} label={`Activity, ${g.label}`} />
                </section>
              ))}
            </div>
            <Pager
              page={page}
              size={PAGE_SIZE}
              total={audit.data.total}
              onPageChange={(next) => update({ page: next === 0 ? null : String(next) })}
            />
          </>
        )}
      </div>
    </>
  )
}
