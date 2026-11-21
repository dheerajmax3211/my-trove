import {
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  KeyValueList,
  type KeyValueItem,
} from '@platform/ui'
import { useClock } from '../../../lib/clock'
import {
  calendarDaysBetween,
  describeDayOffset,
  formatDateTime,
  pluralDays,
} from '../../../lib/dates'
import { isTerminal, type Item } from '../api/types'
import { NEXT_ACTION_LABEL, STAGE_LABEL, STATUS_LABEL } from '../logic/labels'
import { StageGauge } from './StageGauge'

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
    const rows: KeyValueItem[] = [
      {
        id: 'stage',
        label: 'Stage',
        value: (
          <span className="wo-stage">
            <StageGauge item={item} />
            {STAGE_LABEL[followUp.stage]}
          </span>
        ),
      },
      { id: 'next', label: 'Next action', value: NEXT_ACTION_LABEL[followUp.nextAction] },
      ...(at
        ? [
            {
              id: 'when',
              label: 'Scheduled for',
              value: (
                <>
                  <time dateTime={at.toISOString()}>{formatDateTime(at)}</time>{' '}
                  <span className="wo-muted">
                    ({describeDayOffset(calendarDaysBetween(clock(), at))})
                  </span>
                </>
              ),
            },
          ]
        : []),
      ...(followUp.snoozedDays > 0
        ? [
            {
              id: 'snoozed',
              label: 'Snoozed',
              value: `${pluralDays(followUp.snoozedDays)} in total`,
            },
          ]
        : []),
    ]
    body = <KeyValueList items={rows} dense />
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
