import { Timeline, type TimelineItem, type TimelineTone } from '@platform/ui'
import { formatDateTime } from '../../../lib/dates'
import type { EventType, TimelineEvent } from '../api/types'
import { EVENT_LABEL, LETTER_EVENTS } from '../logic/labels'

const TONE: Record<EventType, TimelineTone> = {
  CREATED: 'neutral',
  NUDGE_SENT: 'accent',
  ESCALATION_DRAFTED: 'warning',
  FINAL_NOTICE_DRAFTED: 'danger',
  REPLY_RECEIVED: 'accent',
  SNOOZED: 'neutral',
  RESOLVED: 'success',
  EXPIRED: 'neutral',
  CANCELLED: 'neutral',
}

/** What has happened to an item. Server order is oldest first; it reads newest first. */
export function ItemTimeline({ events }: { events: readonly TimelineEvent[] }) {
  const newestFirst = [...events].reverse()
  if (newestFirst.length === 0) return <p className="wo-muted">Nothing has happened yet.</p>
  const items = newestFirst.map((event): TimelineItem => {
    const at = new Date(event.occurredAt)
    const isLetter = LETTER_EVENTS.includes(event.type) && event.detail
    return {
      id: event.id,
      title: EVENT_LABEL[event.type],
      description: event.summary,
      time: formatDateTime(at),
      dateTime: at.toISOString(),
      tone: TONE[event.type],
      meta: event.detail ? (
        isLetter ? (
          <details className="wo-letter">
            <summary>Show the full text</summary>
            <pre className="wo-pre">{event.detail}</pre>
          </details>
        ) : (
          <p className="wo-muted wo-timeline-detail">{event.detail}</p>
        )
      ) : undefined,
    }
  })
  return <Timeline items={items} label="Timeline, newest first" />
}
