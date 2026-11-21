import { Button, Card, CardContent, CardDescription, CardHeader, CardTitle } from '@platform/ui'
import { useClock } from '../../../lib/clock'
import {
  calendarDaysBetween,
  describeDayOffset,
  formatDateTime,
  pluralDays,
} from '../../../lib/dates'
import { isTerminal, type Item } from '../api/types'
import { NEXT_ACTION_LABEL, STAGE_LABEL, STATUS_LABEL } from '../logic/labels'

/** Live workflow state: which stage the follow-up is in and when the next step fires. */
export function FollowUpCard({ item, onRetry }: { item: Item; onRetry: () => void }) {
  const clock = useClock()
  const { followUp } = item

  let body
  if (isTerminal(item.status)) {
    body = (
      <p>
        This item is {STATUS_LABEL[item.status].toLowerCase()}. Follow-ups have stopped and nothing
        more is scheduled.
      </p>
    )
  } else if (!followUp) {
    body = (
      <>
        <p>
          The live follow-up status is unavailable right now. Your item and its timeline are safe,
          and follow-ups continue in the background.
        </p>
        <Button variant="secondary" size="sm" onClick={onRetry}>
          Check again
        </Button>
      </>
    )
  } else {
    const at = followUp.nextActionAt ? new Date(followUp.nextActionAt) : null
    body = (
      <dl className="wo-dl">
        <div>
          <dt>Stage</dt>
          <dd>{STAGE_LABEL[followUp.stage]}</dd>
        </div>
        <div>
          <dt>Next action</dt>
          <dd>{NEXT_ACTION_LABEL[followUp.nextAction]}</dd>
        </div>
        {at ? (
          <div>
            <dt>Scheduled for</dt>
            <dd>
              <time dateTime={at.toISOString()}>{formatDateTime(at)}</time>{' '}
              <span className="wo-muted">
                ({describeDayOffset(calendarDaysBetween(clock(), at))})
              </span>
            </dd>
          </div>
        ) : null}
        {followUp.snoozedDays > 0 ? (
          <div>
            <dt>Snoozed</dt>
            <dd>{pluralDays(followUp.snoozedDays)} in total</dd>
          </div>
        ) : null}
      </dl>
    )
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle as="h2">Follow-up status</CardTitle>
        <CardDescription>Read live from the follow-up schedule.</CardDescription>
      </CardHeader>
      <CardContent>{body}</CardContent>
    </Card>
  )
}
