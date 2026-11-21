import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@platform/ui'
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
    <section aria-labelledby="schedule-title">
      <Card>
        <CardHeader>
          <CardTitle as="h2" id="schedule-title">
            What happens after you add this
          </CardTitle>
          <CardDescription>
            Waiting On follows up for you on a fixed schedule, counted in days from today. Anything
            you resolve or cancel stops the schedule straight away.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {valid ? (
            <ScheduleList steps={buildSchedule(plan, today)} />
          ) : (
            <p className="wo-muted" role="status">
              {values.customise
                ? 'Fix the schedule days to see the follow-up plan.'
                : 'Choose a category and the date you expected this by, and your follow-up schedule will appear here.'}
            </p>
          )}
          <p className="wo-fineprint">
            Letters are drafted for you to review and send. Replies you forward to the item&apos;s
            own address are read automatically: a payment confirmation closes the item, a refusal
            brings the escalation forward, and a request for more information pauses follow-ups for
            a week.
          </p>
        </CardContent>
      </Card>
    </section>
  )
}
