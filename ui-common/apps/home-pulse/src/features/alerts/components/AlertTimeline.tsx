import { Timeline, type TimelineItem, type TimelineTone } from '@platform/ui'
import { ModuleLink } from '@platform/workspace-kit'
import { useClock } from '../../../lib/clock'
import { formatRelative } from '../../../lib/format'
import { describeAlert, STATUS_LABELS } from '../evidence'
import type { AlertDto } from '../types'

function toneOf(alert: AlertDto): TimelineTone {
  if (alert.status === 'RESOLVED') return 'success'
  if (alert.status === 'ACKNOWLEDGED') return 'neutral'
  return alert.severity === 'CRITICAL' ? 'danger' : 'warning'
}

export interface AlertTimelineProps {
  alerts: readonly AlertDto[]
  label: string
  limit?: number
}

/** Alert history, newest first: what happened, when, and where it stands now. */
export function AlertTimeline({ alerts, label, limit = 6 }: AlertTimelineProps) {
  const clock = useClock()
  const now = clock()
  const items: TimelineItem[] = [...alerts]
    .sort((a, b) => b.openedAt.localeCompare(a.openedAt))
    .slice(0, limit)
    .map((alert) => ({
      id: alert.id,
      tone: toneOf(alert),
      title: (
        <ModuleLink to={`/appliances/${alert.applianceId}`}>
          {describeAlert(alert).headline}
        </ModuleLink>
      ),
      time: formatRelative(alert.openedAt, now),
      dateTime: alert.openedAt,
      description: `${STATUS_LABELS[alert.status]}${
        alert.resolvedAt
          ? `, cleared ${formatRelative(alert.resolvedAt, now).toLowerCase()}`
          : alert.acknowledgedAt
            ? `, acknowledged ${formatRelative(alert.acknowledgedAt, now).toLowerCase()}`
            : ''
      }`,
    }))
  return <Timeline items={items} label={label} compact />
}
