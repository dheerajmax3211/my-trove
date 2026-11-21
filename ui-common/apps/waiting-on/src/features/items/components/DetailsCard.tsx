import { Card, CardContent, CardHeader, CardTitle } from '@platform/ui'
import { formatDate, formatDateTime, parseCalendarDate } from '../../../lib/dates'
import { isTerminal, type Item } from '../api/types'
import { CATEGORY_LABEL, formatAmount } from '../logic/labels'
import { DueIndicator } from './DueIndicator'

export function DetailsCard({ item }: { item: Item }) {
  const expected = parseCalendarDate(item.expectedBy)
  const amount = formatAmount(item.amount, item.currency)
  return (
    <Card>
      <CardHeader>
        <CardTitle as="h2">Details</CardTitle>
      </CardHeader>
      <CardContent>
        <dl className="wo-dl">
          <div>
            <dt>Waiting on</dt>
            <dd>
              {item.counterparty}
              {item.counterpartyEmail ? (
                <>
                  {' '}
                  <span className="wo-muted">({item.counterpartyEmail})</span>
                </>
              ) : null}
            </dd>
          </div>
          <div>
            <dt>Category</dt>
            <dd>{CATEGORY_LABEL[item.category]}</dd>
          </div>
          {amount ? (
            <div>
              <dt>Amount</dt>
              <dd>{amount}</dd>
            </div>
          ) : null}
          <div>
            <dt>Expected by</dt>
            <dd>
              {expected ? formatDate(expected) : item.expectedBy} <DueIndicator item={item} />
            </dd>
          </div>
          <div>
            <dt>Tracking since</dt>
            <dd>{formatDate(new Date(item.createdAt))}</dd>
          </div>
          {isTerminal(item.status) && item.closedAt ? (
            <div>
              <dt>Closed</dt>
              <dd>{formatDateTime(new Date(item.closedAt))}</dd>
            </div>
          ) : null}
          {item.outcome ? (
            <div>
              <dt>Outcome</dt>
              <dd>{item.outcome}</dd>
            </div>
          ) : null}
        </dl>
      </CardContent>
    </Card>
  )
}
