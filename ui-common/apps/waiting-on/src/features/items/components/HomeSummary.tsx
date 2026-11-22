import {
  BentoCard,
  BentoGrid,
  BigStat,
  BubbleChart,
  Button,
  ClockIcon,
  HourglassIcon,
  ProgressStat,
  type Bubble,
} from '@platform/ui'
import { ModuleLink } from '@platform/workspace-kit'
import { useClock } from '../../../lib/clock'
import type { Item } from '../api/types'
import { NEXT_ACTION_LABEL } from '../logic/labels'
import { groupItems, headline, summarize, whenLabel } from '../logic/groups'

/**
 * The home bento: open items, what is overdue (with where things stand), and the one black card for
 * the next follow-up. It always describes the active items, whatever the filters below are set to.
 */
export function HomeSummary({ active }: { active: readonly Item[] }) {
  const clock = useClock()
  const now = clock()
  const summary = summarize(active, now)
  const groups = groupItems(active, now)
  const { next } = summary
  const onTime = summary.open - summary.overdue
  const onTimePct = summary.open === 0 ? 100 : Math.round((onTime / summary.open) * 100)
  const bubbles: Bubble[] = [
    { label: 'Overdue', value: groups.overdue.length, tone: 'ink' as const },
    { label: 'Due soon', value: groups.soon.length, tone: 'lime' as const },
    { label: 'Later', value: groups.later.length, tone: 'lilac' as const },
  ].filter((b) => b.value > 0)

  return (
    <BentoGrid as="section" aria-label="Summary">
      <BentoCard span={5} title="Open items" icon={<HourglassIcon size={18} />}>
        <div role="group" aria-label="Open items">
          <BigStat
            value={summary.open}
            unit={summary.open === 1 ? 'item' : 'items'}
            delta={summary.overdue > 0 ? `${summary.overdue} overdue` : 'All on time'}
            trend={summary.overdue > 0 ? 'down' : 'up'}
          />
        </div>
        <p className="wo-headline" role="status">
          {headline(summary)}
        </p>
        <div className="wo-push">
          <ProgressStat
            label="Still on time"
            value={onTimePct}
            tone="lime"
            caption={`${onTime} of ${summary.open} ${summary.open === 1 ? 'item has' : 'items have'} not passed the expected date`}
          />
        </div>
      </BentoCard>

      <BentoCard span={4} title="Overdue" icon={<ClockIcon size={18} />}>
        <div role="group" aria-label="Overdue">
          <BigStat
            size="md"
            value={summary.overdue}
            unit="past the date"
            caption="Follow-ups are already running for these."
          />
        </div>
        <div style={{ marginTop: 'var(--pp-space-5)' }}>
          {bubbles.length > 0 ? (
            <BubbleChart label="Open items by urgency" bubbles={bubbles} />
          ) : null}
        </div>
      </BentoCard>

      <BentoCard span={3} tone="dark" title="Next follow-up" icon={<HourglassIcon size={18} />}>
        <div role="group" aria-label="Next follow-up">
          <BigStat size="md" value={next ? whenLabel(next.inDays) : 'None'} countUp={false} />
          {next ? (
            <>
              <p className="wo-next-who">
                <ModuleLink to={`/items/${next.item.id}`}>{next.item.counterparty}</ModuleLink>
              </p>
              <p className="wo-next-action">{NEXT_ACTION_LABEL[next.action]}</p>
            </>
          ) : (
            <p className="wo-next-action">Nothing is scheduled</p>
          )}
        </div>
        {next ? (
          <Button asChild size="sm" variant="glow">
            <ModuleLink to={`/items/${next.item.id}`} aria-label={`Open ${next.item.title}`}>
              Open the item
            </ModuleLink>
          </Button>
        ) : null}
        <p className="wo-next-note">
          Waiting On drafts each letter when its day comes. You read it and send it yourself.
        </p>
      </BentoCard>
    </BentoGrid>
  )
}
