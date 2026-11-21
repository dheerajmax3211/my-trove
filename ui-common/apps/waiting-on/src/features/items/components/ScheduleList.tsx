import { formatDate } from '../../../lib/dates'
import type { ScheduleStep } from '../logic/schedule'

/** The follow-up timeline as a plain ordered list: day offset, calendar date, what happens. */
export function ScheduleList({ steps }: { steps: readonly ScheduleStep[] }) {
  return (
    <ol className="wo-schedule" aria-label="Follow-up schedule">
      {steps.map((step) => (
        <li key={step.key}>
          <p className="wo-schedule-when">
            <strong>Day {step.day}</strong>{' '}
            <time dateTime={step.date.toISOString()}>{formatDate(step.date)}</time>
          </p>
          <p className="wo-schedule-what">
            <strong>{step.title}.</strong> {step.description}
          </p>
        </li>
      ))}
    </ol>
  )
}
