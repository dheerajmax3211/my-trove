import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@platform/ui'
import type { SwitchPolicy } from '../../api/types'
import { formatDuration, DAY } from '../../lib/format'
import { buildPreview } from './timelinePreview'

const day = (seconds: number) => `Day ${Math.round((seconds / DAY) * 10) / 10}`

/** The policy drawn on one line, measured from your last check-in. Updates as you type. */
export function TimelinePreviewView({ policy }: { policy: SwitchPolicy }) {
  const preview = buildPreview(policy)
  const total = preview.earliestReleaseSeconds || 1
  return (
    <Card aria-labelledby="preview-title">
      <CardHeader>
        <CardTitle as="h2" id="preview-title">
          What happens if you go silent
        </CardTitle>
        <CardDescription>
          Counted from your last check-in. At the earliest, your vault could be released{' '}
          <strong>{formatDuration(preview.earliestReleaseSeconds)}</strong> after it, and only if
          trustees approve. A single check-in at any moment before then cancels everything.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="stack-3">
          <ol className="preview-bar" aria-label="Phases of the switch, in order">
            {preview.segments.map((s) => (
              <li
                key={s.kind}
                className={`preview-segment seg-${s.kind}`}
                style={{ flexGrow: Math.max(s.endSeconds - s.startSeconds, total * 0.04) }}
              >
                {s.label}
              </li>
            ))}
          </ol>
          <ul className="preview-list">
            {preview.segments.map((s) => (
              <li key={s.kind}>
                <strong>
                  {day(s.startSeconds)} to {day(s.endSeconds)}: {s.label}.
                </strong>{' '}
                {s.description}
              </li>
            ))}
            {preview.steps.map((step, i) => (
              <li key={`step-${i}`} className="muted small">
                Reminder {i + 1} at {day(step.atSeconds)}: {step.urgency.toLowerCase()}, to{' '}
                {step.audience === 'ALL' ? 'you and your trustees' : step.audience.toLowerCase()}.
              </li>
            ))}
          </ul>
        </div>
      </CardContent>
    </Card>
  )
}
