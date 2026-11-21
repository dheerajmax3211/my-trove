import { Button, Callout, Illustration, PlusIcon, Timeline, type TimelineItem } from '@platform/ui'
import { ModuleLink } from '@platform/workspace-kit'
import { buildSchedule, defaultPlan, type StepKey } from '../logic/schedule'

const TONE: Record<StepKey, TimelineItem['tone']> = {
  nudge: 'accent',
  escalate: 'warning',
  finalNotice: 'danger',
  expire: 'neutral',
}

/** What a refund does under the default schedule, in days after the date it was expected. */
const EXAMPLE = buildSchedule(defaultPlan('REFUND', 0), new Date(2000, 0, 1)).map(
  (step): TimelineItem => ({
    id: step.key,
    title: `${step.title}, ${step.day} days after the expected date`,
    description: step.description,
    tone: TONE[step.key],
  }),
)

/** Shown when the user has never added anything: says what the product does, how follow-ups work, and offers the first step. */
export function FirstUse() {
  return (
    <section className="wo-first-use" aria-labelledby="first-use-title">
      <div className="wo-first-use-intro">
        <div className="wo-first-use-copy">
          <h2 id="first-use-title">Tell Waiting On what you are waiting for</h2>
          <p>
            A refund, an insurance claim, an expense reimbursement, an approval or a delivery. Add
            it with the date you expected it. Waiting On keeps a follow-up schedule going for weeks,
            and drafts a letter for each step: a friendly nudge, then a firm escalation letter, then
            a final notice. If nobody ever answers, it closes the item.
          </p>
          <Button asChild leftIcon={<PlusIcon size={18} />}>
            <ModuleLink to="/new">Add your first item</ModuleLink>
          </Button>
        </div>
        <Illustration name="letter" size={240} className="wo-first-use-art" />
      </div>

      <div className="wo-first-use-how">
        <h3>How the follow-ups work</h3>
        <p className="wo-muted">
          Each category has its own default timing, and you can change it when you add an item. This
          is a refund:
        </p>
        <Timeline items={EXAMPLE} label="Follow-up schedule for a refund" compact />
      </div>

      <Callout variant="note" title="You send the letters">
        Waiting On does not email anyone for you. It prepares each letter on its day and keeps it
        ready to copy. Each item also gets its own private reply address: forward the answers you
        get there, and a payment closes the item while a refusal brings the escalation forward.
      </Callout>
    </section>
  )
}
