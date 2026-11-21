import { ModuleLink } from '@platform/workspace-kit'
import { useClock } from '../../../lib/clock'
import { formatDate, parseCalendarDate } from '../../../lib/dates'
import { isTerminal, type Item } from '../api/types'
import { CATEGORY_LABEL, NEXT_ACTION_LABEL, formatAmount } from '../logic/labels'
import { estimateNextStep } from '../logic/schedule'
import { DueIndicator } from './DueIndicator'
import { StageGauge } from './StageGauge'
import { StatusBadge } from './StatusBadge'

function Closing({ item }: { item: Item }) {
  const closed = item.closedAt ? formatDate(new Date(item.closedAt)) : null
  return (
    <p className="wo-row-next">
      {item.status === 'RESOLVED'
        ? 'Resolved'
        : item.status === 'EXPIRED'
          ? 'Expired'
          : 'Cancelled'}
      {closed ? ` on ${closed}` : ''}
      {item.status === 'RESOLVED' && item.outcome ? `: ${item.outcome}` : ''}
    </p>
  )
}

function NextStep({ item }: { item: Item }) {
  const now = useClock()()
  const next = estimateNextStep(item, now)
  if (!next) return null
  return (
    <p className="wo-row-next">
      <span className="wo-muted">Next:</span> {NEXT_ACTION_LABEL[next.action].toLowerCase()}{' '}
      <time dateTime={next.at.toISOString()}>around {formatDate(next.at)}</time>
    </p>
  )
}

/** One item in a group. The whole row opens the item (the title link stretches over it). */
export function ItemRow({ item }: { item: Item }) {
  const expected = parseCalendarDate(item.expectedBy)
  const amount = formatAmount(item.amount, item.currency)
  return (
    <li className="wo-row">
      <div className="wo-row-main">
        <h3 className="wo-row-title">
          <ModuleLink to={`/items/${item.id}`}>{item.title}</ModuleLink>
        </h3>
        <p className="wo-row-meta">
          <span>Waiting on {item.counterparty}</span>
          <span>{CATEGORY_LABEL[item.category]}</span>
          {amount ? <span>{amount}</span> : null}
          {expected ? (
            <span>
              Expected by <time dateTime={item.expectedBy}>{formatDate(expected)}</time>
            </span>
          ) : null}
        </p>
        {isTerminal(item.status) ? <Closing item={item} /> : <NextStep item={item} />}
      </div>
      <div className="wo-row-status">
        <DueIndicator item={item} />
        <StatusBadge status={item.status} />
        <StageGauge item={item} />
      </div>
    </li>
  )
}
