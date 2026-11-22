import { BentoCard, CalendarIcon } from '@platform/ui'
import { useClock } from '../../../lib/clock'
import { effectivePlan, type NewItemValues } from '../logic/form'
import { buildSchedule, validatePlan } from '../logic/schedule'
import { ScheduleList } from './ScheduleList'

/** Explains, before the user commits, exactly which follow-ups this item will create and when. */
export function SchedulePreview({ values }: { values: NewItemValues }) {
  const clock = useClock()
  const today = clock()
  const plan = effectivePlan(values, today)
  const valid = plan !== null && Object.keys(validatePlan(plan)).length === 0

  return (
    <BentoCard
      span={12}
      tone="dark"
      title="What happens after you add this"
      icon={<CalendarIcon size={18} />}
    >
      <div className="wo-preview-item" aria-live="polite">
        <strong>{values.title.trim() || 'What you are waiting for'}</strong>
        <span>
          {values.counterparty.trim() ? `Waiting on ${values.counterparty.trim()}` : 'Waiting on …'}
          {values.amount.trim() ? ` · ${values.amount.trim()} ${values.currency}` : ''}
        </span>
      </div>
      <p className="wo-detail-note" style={{ marginBottom: 'var(--pp-space-5)' }}>
        Waiting On follows up for you on a fixed schedule, counted in days from today. Anything you
        resolve or cancel stops the schedule straight away.
      </p>
      {valid ? (
        <ScheduleList steps={buildSchedule(plan, today)} />
      ) : (
        <p className="wo-muted" role="status">
          {values.customise
            ? 'Fix the schedule days to see the follow-up plan.'
            : 'Choose a category and the date you expected this by, and your follow-up schedule will appear here.'}
        </p>
      )}
      <p className="wo-fineprint" style={{ marginTop: 'var(--pp-space-5)' }}>
        Letters are drafted for you to review and send. Replies you forward to the item&apos;s own
        address are read automatically: a payment confirmation closes the item, a refusal brings the
        escalation forward, and a request for more information pauses follow-ups for a week.
      </p>
    </BentoCard>
  )
}
