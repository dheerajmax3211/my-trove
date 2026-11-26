import {
  BentoCard,
  BentoGrid,
  Button,
  Illustration,
  PlusIcon,
  ShieldIcon,
  Timeline,
  HourglassIcon,
  ClockIcon,
  type TimelineItem,
} from '@platform/ui'
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
    <BentoGrid>
      <BentoCard
        span={7}
        tone="dark"
        padding="lg"
        title="Tell Waiting On what you are waiting for"
        icon={<HourglassIcon size={18} />}
      >
        <div className="wo-first-copy">
          <p>
            A refund, an insurance claim, an expense reimbursement, an approval or a delivery. Add
            it with the date you expected it. Waiting On keeps a follow-up schedule going for weeks,
            and drafts a letter for each step: a friendly nudge, then a firm escalation letter, then
            a final notice. If nobody ever answers, it closes the item.
          </p>
          <Button asChild variant="glow" leftIcon={<PlusIcon size={18} />}>
            <ModuleLink to="/new">Add your first item</ModuleLink>
          </Button>
        </div>
        <Illustration name="letter" size={200} className="wo-first-art" />
      </BentoCard>

      <BentoCard span={5} title="How the follow-ups work" icon={<ClockIcon size={18} />}>
        <p className="wo-muted" style={{ margin: '0 0 var(--pp-space-4)' }}>
          Each category has its own default timing, and you can change it when you add an item. This
          is a refund:
        </p>
        <Timeline items={EXAMPLE} label="Follow-up schedule for a refund" compact />
      </BentoCard>

      <BentoCard span={12} title="You send the letters" icon={<ShieldIcon size={18} />}>
        <p className="wo-detail-note" style={{ maxWidth: '70ch' }}>
          Waiting On does not email anyone for you. It prepares each letter on its day and keeps it
          ready to copy. You send it yourself, then mark the item resolved when the money or the
          approval arrives. Replies that reach Waiting On by email are read and move the follow-up;
          a reply that lands in your own inbox can be pasted on the item.
        </p>
      </BentoCard>
    </BentoGrid>
  )
}
