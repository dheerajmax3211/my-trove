import { formatDateTime } from '../../../lib/dates'
import type { TimelineEvent } from '../api/types'
import { EVENT_LABEL, LETTER_EVENTS } from '../logic/labels'

/** Server order is oldest first; the timeline reads newest first. */
export function Timeline({ events }: { events: readonly TimelineEvent[] }) {
  const newestFirst = [...events].reverse()
  if (newestFirst.length === 0) return <p className="wo-muted">Nothing has happened yet.</p>
  return (
    <ol className="wo-timeline" aria-label="Timeline, newest first">
      {newestFirst.map((event) => {
        const at = new Date(event.occurredAt)
        const isLetter = LETTER_EVENTS.includes(event.type) && event.detail
        return (
          <li key={event.id} className="wo-timeline-item">
            <div className="wo-timeline-head">
              <strong>{EVENT_LABEL[event.type]}</strong>
              <time dateTime={at.toISOString()}>{formatDateTime(at)}</time>
            </div>
            <p>{event.summary}</p>
            {event.detail ? (
              isLetter ? (
                <details>
                  <summary>Show the full text</summary>
                  <pre className="wo-pre">{event.detail}</pre>
                </details>
              ) : (
                <p className="wo-muted">{event.detail}</p>
              )
            ) : null}
          </li>
        )
      })}
    </ol>
  )
}
