import { BentoCard, Badge, CalendarIcon, Timeline, type TimelineItem } from '@platform/ui'
import { addDays, formatDate } from '../../../lib/dates'
import { isTerminal, type Item } from '../api/types'
import { buildSchedule, type StepKey } from '../logic/schedule'
import { rungs } from './StageGauge'

const LETTER_STEPS: readonly StepKey[] = ['nudge', 'escalate', 'finalNotice']

/**
 * The whole plan for an open item: every step, its date (snoozes included) and where the item is now.
 * It answers "what happens if nobody replies" before it happens.
 */
export function PlanCard({ item }: { item: Item }) {
  if (isTerminal(item.status)) return null
  const snoozed = item.followUp?.snoozedDays ?? 0
  const steps = buildSchedule(item.plan, addDays(new Date(item.createdAt), snoozed))
  const { reached } = rungs(item)
  const next =
    item.followUp?.nextAction === 'EXPIRE' ? 'expire' : (LETTER_STEPS[reached] ?? 'expire')

  const items = steps.map((step): TimelineItem => {
    const letterIndex = LETTER_STEPS.indexOf(step.key)
    const done = letterIndex !== -1 && letterIndex < reached
    return {
      id: step.key,
      title: step.title,
      description: step.description,
      time: formatDate(step.date),
      dateTime: step.date.toISOString(),
      tone: done ? 'success' : step.key === next ? 'accent' : 'neutral',
      meta: done ? (
        <Badge variant="success">Reached</Badge>
      ) : step.key === next ? (
        <Badge variant="info">Next</Badge>
      ) : undefined,
    }
  })

  return (
    <BentoCard span={5} title="The follow-up plan" icon={<CalendarIcon size={18} />}>
      <p className="wo-detail-note" style={{ marginBottom: 'var(--pp-space-5)' }}>
        What happens if nobody replies.
        {snoozed > 0 ? ` Dates include ${snoozed} ${snoozed === 1 ? 'day' : 'days'} snoozed.` : ''}
      </p>
      <Timeline items={items} label="Follow-up plan" compact />
    </BentoCard>
  )
}
