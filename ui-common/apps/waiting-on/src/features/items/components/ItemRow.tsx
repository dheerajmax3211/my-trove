import { ArrowUpRightIcon, Avatar, Badge } from '@platform/ui'
import { ModuleLink } from '@platform/workspace-kit'
import { useClock } from '../../../lib/clock'
import { formatDate, parseCalendarDate } from '../../../lib/dates'
import { isTerminal, type Item } from '../api/types'
import { CATEGORY_LABEL, NEXT_ACTION_LABEL, formatAmount } from '../logic/labels'
import type { GroupKey } from '../logic/groups'
import { DueIndicator } from './DueIndicator'
import { StageGauge } from './StageGauge'
import { StatusBadge } from './StatusBadge'

function Closing({ item }: { item: Item }) {
  const closed = item.closedAt ? formatDate(new Date(item.closedAt)) : null
  return (
    <p className="wo-card-next">
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

/** The service's next step. A plan-based one (the workflow did not answer) is marked as an estimate. */
function NextStep({ item }: { item: Item }) {
  const now = useClock()()
  const next = item.nextStep
  if (!next) return null
  const at = new Date(next.at)
  // A step whose date has passed is about to run (the follow-up service picks it up), never "next" in the past.
  const due = at.getTime() <= now.getTime()
  const estimated = next.source === 'PLAN'
  return (
    <p className="wo-card-next">
      Next: <strong>{NEXT_ACTION_LABEL[next.action].toLowerCase()}</strong>{' '}
      {due ? (
        'due now'
      ) : (
        <time dateTime={next.at}>
          {estimated ? 'around ' : 'on '}
          {formatDate(at)}
        </time>
      )}
      {estimated && !due ? <span className="wo-muted"> (estimated from the plan)</span> : null}
    </p>
  )
}

/** One item, one card. The whole card opens the item (the title link stretches over it). */
export function ItemRow({ item, group }: { item: Item; group?: GroupKey }) {
  const expected = parseCalendarDate(item.expectedBy)
  const amount = formatAmount(item.amount, item.currency)
  const closed = isTerminal(item.status)
  return (
    <li className="wo-card" data-group={group} data-closed={closed ? 'true' : 'false'}>
      <div className="wo-card-top">
        <Avatar name={item.counterparty} size="sm" decorative />
        <p className="wo-card-who">Waiting on {item.counterparty}</p>
        <StatusBadge status={item.status} />
      </div>
      <h3 className="wo-card-title">
        <ModuleLink to={`/items/${item.id}`}>{item.title}</ModuleLink>
      </h3>
      <div className="wo-card-figure">
        {amount ? (
          <p className="wo-amount">{amount}</p>
        ) : (
          <p className="wo-amount wo-amount-none">{CATEGORY_LABEL[item.category]}</p>
        )}
        {expected ? (
          <p className="wo-expected">
            Expected by <time dateTime={item.expectedBy}>{formatDate(expected)}</time>
          </p>
        ) : null}
      </div>
      {closed ? null : (
        <div className="wo-card-flags">
          <DueIndicator item={item} />
          {amount ? <Badge variant="neutral">{CATEGORY_LABEL[item.category]}</Badge> : null}
        </div>
      )}
      {closed ? null : <StageGauge item={item} labels />}
      <div className="wo-card-foot">
        {closed ? <Closing item={item} /> : <NextStep item={item} />}
        <span className="wo-card-go" aria-hidden="true">
          <ArrowUpRightIcon size={18} />
        </span>
      </div>
    </li>
  )
}
