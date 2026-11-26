import {
  BentoCard,
  BigStat,
  Button,
  ClockIcon,
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
    const planned = item.nextStep
    body = (
      <>
        <p>
          The live follow-up status is unavailable right now. Your item and its timeline are safe,
          and follow-ups continue in the background.
        </p>
        {planned ? (
          <p className="wo-muted">
            By the plan, the next step is {NEXT_ACTION_LABEL[planned.action].toLowerCase()} around{' '}
            <time dateTime={planned.at}>{formatDateTime(new Date(planned.at))}</time>. This
            estimate does not include snoozes.
          </p>
        ) : null}
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
        value: STAGE_LABEL[followUp.stage],
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
    const days = at ? calendarDaysBetween(clock(), at) : null
    body = (
      <div className="wo-detail-status">
        {days !== null ? (
          <BigStat
            size="md"
            value={days <= 0 ? 'Today' : days}
            unit={days <= 0 ? undefined : days === 1 ? 'day to go' : 'days to go'}
            countUp={days > 0}
          />
        ) : null}
        <StageGauge item={item} size="lg" />
        <KeyValueList items={rows} layout="stacked" dense />
      </div>
    )
  }

  return (
    <BentoCard span={4} tone="dark" title="Follow-up status" icon={<ClockIcon size={18} />}>
      {body}
    </BentoCard>
  )
}
