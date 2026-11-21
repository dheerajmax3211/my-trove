import {
  Badge,
  Button,
  DataTable,
  EmptyState,
  Field,
  InboxIcon,
  PageHeader,
  Select,
  type DataTableColumn,
} from '@platform/ui'
import { useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import type { AuditEntry } from '../../../shared/api/types'
import { ErrorState } from '../../../shared/components/ErrorState'
import { eventLabel, summarizeEntry } from '../../../shared/lib/audit'
import { formatDateTime } from '../../../shared/lib/format'
import { useClients } from '../../clients/hooks/useClients'
import { useAccessLog } from '../hooks/useAccessLog'

const PAGE_SIZE = 20

const DENIED: ReadonlySet<string> = new Set(['DATA_DENIED'])

export function HistoryPage() {
  const [params, setParams] = useSearchParams()
  const clientId = params.get('client') ?? ''
  /** Cursors of the pages already visited: page n starts before `cursors[n]`. */
  const [cursors, setCursors] = useState<(number | undefined)[]>([undefined])
  const clients = useClients()
  const page = cursors.length - 1
  // One extra row tells us whether an older page exists, without a count endpoint.
  const log = useAccessLog({
    limit: PAGE_SIZE + 1,
    ...(cursors[page] !== undefined ? { beforeSeq: cursors[page] } : {}),
    ...(clientId ? { clientId } : {}),
  })

  const entries = log.data?.slice(0, PAGE_SIZE) ?? []
  const hasOlder = (log.data?.length ?? 0) > PAGE_SIZE
  const clientName = (id: string | null) =>
    id ? (clients.data?.find((c) => c.clientId === id)?.name ?? id) : 'You'

  const columns: DataTableColumn<AuditEntry>[] = [
    { id: 'seq', header: '#', cell: (e) => e.seq, width: '4rem' },
    { id: 'when', header: 'When', cell: (e) => formatDateTime(e.occurredAt) },
    {
      id: 'event',
      header: 'What happened',
      cell: (e) => (
        <Badge variant={DENIED.has(e.eventType) ? 'danger' : 'neutral'}>
          {eventLabel(e.eventType)}
        </Badge>
      ),
    },
    {
      id: 'who',
      header: 'App',
      cell: (e) => (e.actorType === 'CLIENT' ? clientName(e.clientId) : clientName(null)),
    },
    { id: 'detail', header: 'Details', cell: (e) => summarizeEntry(e) },
  ]

  const selectClient = (id: string) => {
    setCursors([undefined])
    setParams(id ? { client: id } : {})
  }

  return (
    <>
      <PageHeader
        title="Access history"
        description="Every read, refusal and change, newest first. Attribute values are never stored here."
      />
      <div className="page-stack">
        <div className="toolbar">
          <Field label="Show activity for" className="toolbar-grow">
            <Select value={clientId} onChange={(e) => selectClient(e.target.value)}>
              <option value="">All apps and my own changes</option>
              {(clients.data ?? []).map((c) => (
                <option key={c.clientId} value={c.clientId}>
                  {c.name}
                </option>
              ))}
            </Select>
          </Field>
        </div>
        {log.isError ? (
          <ErrorState error={log.error} onRetry={() => void log.refetch()} />
        ) : (
          <DataTable
            caption="Access history"
            columns={columns}
            data={entries}
            getRowId={(e) => String(e.seq)}
            loading={log.isPending}
            emptyState={
              <EmptyState
                icon={<InboxIcon size={24} />}
                title="No activity yet"
                description={
                  clientId
                    ? 'This app has not done anything yet.'
                    : 'Reads, refusals and changes will appear here as they happen.'
                }
                headingAs="h3"
              />
            }
          />
        )}
        <nav className="pager" aria-label="History pages">
          <Button
            variant="secondary"
            disabled={page === 0}
            onClick={() => setCursors((c) => c.slice(0, -1))}
          >
            Newer
          </Button>
          <span aria-live="polite">Page {page + 1}</span>
          <Button
            variant="secondary"
            disabled={!hasOlder}
            onClick={() => {
              const last = entries.at(-1)
              if (last) setCursors((c) => [...c, last.seq])
            }}
          >
            Older
          </Button>
        </nav>
      </div>
    </>
  )
}
