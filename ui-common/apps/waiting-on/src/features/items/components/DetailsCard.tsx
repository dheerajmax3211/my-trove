import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  KeyValueList,
  type KeyValueItem,
} from '@platform/ui'
import { formatDate, formatDateTime, parseCalendarDate } from '../../../lib/dates'
import { isTerminal, type Item } from '../api/types'
import { CATEGORY_LABEL, formatAmount } from '../logic/labels'
import { DueIndicator } from './DueIndicator'

export function DetailsCard({ item }: { item: Item }) {
  const expected = parseCalendarDate(item.expectedBy)
  const amount = formatAmount(item.amount, item.currency)
  const rows: KeyValueItem[] = [
    {
      id: 'who',
      label: 'Waiting on',
      value: (
        <>
          {item.counterparty}
          {item.counterpartyEmail ? (
            <>
              {' '}
              <span className="wo-muted">({item.counterpartyEmail})</span>
            </>
          ) : null}
        </>
      ),
    },
    { id: 'category', label: 'Category', value: CATEGORY_LABEL[item.category] },
    ...(amount ? [{ id: 'amount', label: 'Amount', value: amount }] : []),
    {
      id: 'expected',
      label: 'Expected by',
      value: (
        <>
          {expected ? formatDate(expected) : item.expectedBy} <DueIndicator item={item} />
        </>
      ),
    },
    { id: 'since', label: 'Tracking since', value: formatDate(new Date(item.createdAt)) },
    ...(isTerminal(item.status) && item.closedAt
      ? [{ id: 'closed', label: 'Closed', value: formatDateTime(new Date(item.closedAt)) }]
      : []),
    ...(item.outcome ? [{ id: 'outcome', label: 'Outcome', value: item.outcome }] : []),
  ]
  return (
    <Card>
      <CardHeader>
        <CardTitle as="h2">Details</CardTitle>
      </CardHeader>
      <CardContent>
        <KeyValueList items={rows} dense />
      </CardContent>
    </Card>
  )
}
