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

/**
 * Rising notches, like the bitting of a key: one per follow-up letter, filled as the follow-up climbs.
 * Closed items show no gauge. The status badge next to it says the same in words.
 */
export function StageGauge({ item }: { item: Pick<Item, 'status' | 'plan' | 'followUp'> }) {
  if (isTerminal(item.status)) return null
  const { total, reached } = rungs(item)
  return (
    <span
      className="wo-gauge"
      role="img"
      aria-label={`${reached} of ${total} follow-up letters reached`}
    >
      {Array.from({ length: total }, (_, i) => (
        <i
          key={i}
          className="wo-gauge-notch"
          data-on={i < reached ? 'true' : 'false'}
          style={{ blockSize: `${0.6 + i * 0.35}rem` }}
        />
      ))}
    </span>
  )
}
