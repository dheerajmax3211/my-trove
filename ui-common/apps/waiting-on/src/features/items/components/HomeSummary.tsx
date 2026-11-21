import { KeyCut, Stat } from '@platform/ui'
import { ModuleLink } from '@platform/workspace-kit'
import { useClock } from '../../../lib/clock'
import type { Item } from '../api/types'
import { NEXT_ACTION_LABEL } from '../logic/labels'
import { headline, summarize, whenLabel } from '../logic/groups'

/**
 * The one dark band on the home page: how things stand in a sentence, then the three numbers that matter.
 * It always describes the active items, whatever the filters below are set to.
 */
export function HomeSummary({ active }: { active: readonly Item[] }) {
  const clock = useClock()
  const summary = summarize(active, clock())
  const { next } = summary
  return (
    <section className="wo-hero pp-grain" data-surface="vault" aria-label="Summary">
      <p className="wo-hero-lead" role="status">
        {headline(summary)}
      </p>
      <div className="wo-hero-stats">
        <Stat label="Open items" value={summary.open} hint="Still waiting for an answer" />
        <Stat
          label="Overdue"
          value={summary.overdue}
          goodDirection="down"
          hint="Past the expected date"
        />
        <Stat
          label="Next follow-up"
          value={next ? whenLabel(next.inDays) : 'None'}
          hint={
            next ? (
              <>
                {NEXT_ACTION_LABEL[next.action]} to{' '}
                <ModuleLink to={`/items/${next.item.id}`}>{next.item.counterparty}</ModuleLink>
              </>
            ) : (
              'Nothing is scheduled'
            )
          }
        />
      </div>
      <p className="wo-hero-note">
        Waiting On drafts each letter when its day comes. You read it and send it yourself.
      </p>
      <KeyCut className="wo-hero-cut" height={14} />
    </section>
  )
}
