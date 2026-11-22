import { BentoCard, BigStat, FileIcon, KeyValueList, type KeyValueItem } from '@platform/ui'
import { formatDate, formatDateTime, parseCalendarDate } from '../../../lib/dates'
import { isTerminal, type Item } from '../api/types'
import { CATEGORY_LABEL } from '../logic/labels'
import { DueIndicator } from './DueIndicator'

export function DetailsCard({ item }: { item: Item }) {
  const expected = parseCalendarDate(item.expectedBy)
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
    {
      id: 'expected',
      label: 'Expected by',
      value: (
        <>
          {expected ? formatDate(expected) : item.expectedBy}
          <span style={{ display: 'block', marginTop: 4 }}>
            <DueIndicator item={item} />
          </span>
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
    <BentoCard span={5} title="Details" icon={<FileIcon size={18} />}>
      {item.amount !== null ? (
        <div style={{ marginBottom: 'var(--pp-space-5)' }}>
          <BigStat
            size="md"
            value={item.amount}
            format={{ style: 'currency', currency: item.currency ?? 'USD' }}
            caption={`${CATEGORY_LABEL[item.category]} you are owed`}
          />
        </div>
      ) : null}
      <KeyValueList items={rows} dense />
    </BentoCard>
  )
}
