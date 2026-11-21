import {
  Badge,
  Button,
  DataTable,
  EmptyState,
  PageHeader,
  type DataTableColumn,
} from '@platform/ui'
import { useState } from 'react'
import { Link } from 'react-router-dom'
import type { EntryView } from '../../../api/types'
import { AccessNotice } from '../../../components/AccessNotice'
import { MoneyText } from '../../../components/MoneyText'
import { QueryState } from '../../../components/QueryState'
import { formatDateTime } from '../../../lib/dates'
import { useHousehold } from '../../household/hooks/useHousehold'
import { ReverseDialog } from '../components/ReverseDialog'
import { useEntries } from '../hooks'
import { KIND_LABEL, reversedIds, summarizeEntry } from '../entryUtils'

const PAGE_SIZE = 20

export function ActivityPage() {
  const h = useHousehold()
  const [page, setPage] = useState(0)
  const [target, setTarget] = useState<EntryView | null>(null)
  const entries = useEntries(h.household.id, page, PAGE_SIZE, !h.isKid)
  if (h.isKid) return <AccessNotice what="The activity log" to={`/h/${h.household.id}`} />

  return (
    <>
      <PageHeader
        title="Activity"
        description="Every entry in the ledger, newest first. Mistakes are fixed with a reversal, never by editing."
      />
      <QueryState
        query={entries}
        loadingLabel="Loading activity"
        errorTitle="We could not load the activity"
      >
        {(list) => {
          const reversed = reversedIds(list)
          const columns: DataTableColumn<EntryView>[] = [
            { id: 'when', header: 'When', cell: (e) => formatDateTime(e.postedAt) },
            {
              id: 'kind',
              header: 'Kind',
              cell: (e) => (
                <>
                  <Badge variant={e.kind === 'REVERSAL' ? 'warning' : 'neutral'}>
                    {KIND_LABEL[e.kind]}
                  </Badge>
                  {reversed.has(e.id) ? <Badge variant="danger"> Reversed</Badge> : null}
                </>
              ),
            },
            { id: 'description', header: 'Description', cell: (e) => e.description },
            {
              id: 'route',
              header: 'Between',
              cell: (e) => {
                const s = summarizeEntry(e, h.accountName)
                return `${s.from} to ${s.to}`
              },
            },
            {
              id: 'amount',
              header: 'Amount',
              align: 'end',
              cell: (e) => (
                <MoneyText
                  minor={summarizeEntry(e, h.accountName).movedMinor}
                  currency={h.currency}
                />
              ),
            },
            { id: 'by', header: 'By', cell: (e) => h.memberName(e.createdByUid) },
            ...(h.trusted
              ? [
                  {
                    id: 'actions',
                    header: 'Actions',
                    cell: (e: EntryView) =>
                      e.kind === 'REVERSAL' || reversed.has(e.id) ? null : (
                        <Button
                          size="sm"
                          variant="secondary"
                          aria-label={`Reverse ${e.description}`}
                          onClick={() => setTarget(e)}
                        >
                          Reverse
                        </Button>
                      ),
                  } satisfies DataTableColumn<EntryView>,
                ]
              : []),
          ]
          return (
            <>
              <DataTable
                caption="Ledger entries"
                columns={columns}
                data={list}
                getRowId={(e) => e.id}
                emptyState={
                  <EmptyState
                    headingAs="h2"
                    title={page === 0 ? 'No activity yet' : 'No more entries'}
                    description="Record a deposit or a spend and it will appear here."
                    action={
                      <Button asChild>
                        <Link to={`/h/${h.household.id}/move`}>Move money</Link>
                      </Button>
                    }
                  />
                }
              />
              <nav className="ft-pager" aria-label="Activity pages">
                <Button
                  variant="secondary"
                  size="sm"
                  disabled={page === 0}
                  onClick={() => setPage(page - 1)}
                >
                  Newer
                </Button>
                <span>Page {page + 1}</span>
                <Button
                  variant="secondary"
                  size="sm"
                  disabled={list.length < PAGE_SIZE}
                  onClick={() => setPage(page + 1)}
                >
                  Older
                </Button>
              </nav>
            </>
          )
        }}
      </QueryState>
      {target ? <ReverseDialog entry={target} onClose={() => setTarget(null)} /> : null}
    </>
  )
}
