import { isTerminal, type Item } from '../api/types'

/** How many letters the plan has (nudge, escalation, and a final notice unless it is switched off) and how many have been reached. */
export function rungs(item: Pick<Item, 'status' | 'plan' | 'followUp'>): {
  total: number
  reached: number
} {
  const total = item.plan.finalNoticeAfterDays > 0 ? 3 : 2
  if (isTerminal(item.status)) return { total, reached: 0 }
  if (item.status === 'OPEN') return { total, reached: 0 }
  if (item.status === 'NUDGED') return { total, reached: 1 }
  return { total, reached: item.followUp?.stage === 'FINAL_NOTICE' ? Math.min(3, total) : 2 }
}

const NAMES = ['Nudge', 'Escalate', 'Final notice']

/**
 * A progress rail: one segment per follow-up letter, filled as the follow-up climbs, with the
 * letter names underneath when asked. Closed items show no rail. The status badge says the same in words.
 */
export function StageGauge({
  item,
  labels = false,
  size = 'md',
}: {
  item: Pick<Item, 'status' | 'plan' | 'followUp'>
  labels?: boolean
  size?: 'md' | 'lg'
}) {
  if (isTerminal(item.status)) return null
  const { total, reached } = rungs(item)
  return (
    <div className="wo-rail" data-size={size}>
      <div
        className="wo-rail-track"
        role="img"
        aria-label={`${reached} of ${total} follow-up letters reached`}
      >
        {Array.from({ length: total }, (_, i) => (
          <i
            key={i}
            className="wo-rail-seg"
            data-on={i < reached ? 'true' : 'false'}
            data-last={i === total - 1 ? 'true' : 'false'}
            style={{ ['--i' as string]: i }}
          />
        ))}
      </div>
      {labels ? (
        <ol className="wo-rail-names" aria-hidden="true">
          {Array.from({ length: total }, (_, i) => (
            <li key={i} data-on={i < reached ? 'true' : 'false'}>
              {NAMES[i]}
            </li>
          ))}
        </ol>
      ) : null}
    </div>
  )
}
