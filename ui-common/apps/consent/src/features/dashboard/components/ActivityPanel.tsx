import {
  ActivityIcon,
  BentoCard,
  EmptyState,
  Illustration,
  Timeline,
  type TimelineItem,
} from '@platform/ui'
import { ModuleLink } from '@platform/workspace-kit'
import type { AuditEntry, AuditEventType } from '../../../shared/api/types'
import { eventLabel, summarizeEntry } from '../../../shared/lib/audit'
import { formatDateTime } from '../../../shared/lib/format'

type Tone = NonNullable<TimelineItem['tone']>

const TONE: Partial<Record<AuditEventType, Tone>> = {
  DATA_READ: 'accent',
  DATA_DENIED: 'danger',
  REQUEST_APPROVED: 'success',
  REQUEST_DENIED: 'warning',
  GRANT_REVOKED: 'warning',
  ACCESS_REQUESTED: 'brass',
  CLIENT_DISABLED: 'danger',
}

export function activityItems(
  entries: readonly AuditEntry[],
  nameOf: (clientId: string | null) => string,
): TimelineItem[] {
  return entries.map((entry) => {
    const who = entry.actorType === 'CLIENT' ? nameOf(entry.clientId) : 'You'
    const summary = summarizeEntry(entry)
    return {
      id: String(entry.seq),
      title: eventLabel(entry.eventType),
      description: who,
      ...(summary ? { meta: <span className="activity-detail">{summary}</span> } : {}),
      time: formatDateTime(entry.occurredAt),
      dateTime: entry.occurredAt,
      tone: TONE[entry.eventType] ?? 'neutral',
    }
  })
}

export interface ActivityPanelProps {
  entries: readonly AuditEntry[]
  nameOf: (clientId: string | null) => string
}

/** The last few entries of the audit log, newest first, in plain words. */
export function ActivityPanel({ entries, nameOf }: ActivityPanelProps) {
  return (
    <BentoCard
      span={7}
      title="Recent activity"
      icon={<ActivityIcon size={18} />}
      actions={
        <ModuleLink to="/history" className="section-link" style={{ marginInlineStart: 0 }}>
          See all history
        </ModuleLink>
      }
    >
      {entries.length === 0 ? (
        <EmptyState
          illustration={<Illustration name="empty" size={160} />}
          title="No activity yet"
          description="Reads, refusals and changes show up here as they happen."
          headingAs="h3"
        />
      ) : (
        <Timeline items={activityItems(entries, nameOf)} label="Recent activity" compact />
      )}
    </BentoCard>
  )
}
