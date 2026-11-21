import { Badge } from '@platform/ui'
import { useClock } from '../../../lib/clock'
import { pluralDays } from '../../../lib/dates'
import type { Item } from '../api/types'
import { dueState } from '../logic/schedule'

/** At-a-glance overdue marker for active items. The text always says it; colour only reinforces. */
export function DueIndicator({ item }: { item: Pick<Item, 'status' | 'expectedBy'> }) {
  const clock = useClock()
  const due = dueState(item, clock())
  if (!due) return null
  if (due.kind === 'overdue')
    return <Badge variant="danger">{`Overdue by ${pluralDays(due.days)}`}</Badge>
  if (due.kind === 'today') return <Badge variant="warning">Due today</Badge>
  return due.days <= 7 ? <Badge variant="neutral">{`Due in ${pluralDays(due.days)}`}</Badge> : null
}
