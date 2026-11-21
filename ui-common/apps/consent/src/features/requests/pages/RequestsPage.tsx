import {
  DataTable,
  EmptyState,
  Illustration,
  PageHeader,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
  VisuallyHidden,
  type DataTableColumn,
} from '@platform/ui'
import { useState } from 'react'
import type { AccessRequest } from '../../../shared/api/types'
import { ErrorState } from '../../../shared/components/ErrorState'
import { LoadingBlock } from '../../../shared/components/LoadingBlock'
import { ScopeList } from '../../../shared/components/ScopeList'
import { StatusBadge } from '../../../shared/components/StatusBadge'
import { formatDateTime, formatDuration } from '../../../shared/lib/format'
import { ApproveDialog } from '../components/ApproveDialog'
import { DenyDialog } from '../components/DenyDialog'
import { RequestCard } from '../components/RequestCard'
import { useAttributes } from '../../vault/hooks/useVault'
import { useAllRequests, usePendingRequests } from '../hooks/useRequests'

const pastColumns: DataTableColumn<AccessRequest>[] = [
  {
    id: 'client',
    header: 'App',
    sortValue: (r) => r.clientName,
    cell: (r) => r.clientName,
  },
  {
    id: 'scopes',
    header: 'Asked to read',
    cell: (r) => <ScopeList scopes={r.scopes} label={`Scopes requested by ${r.clientName}`} />,
  },
  { id: 'purpose', header: 'Purpose', cell: (r) => r.purpose },
  {
    id: 'duration',
    header: 'For',
    sortValue: (r) => r.durationSeconds,
    cell: (r) => formatDuration(r.durationSeconds),
  },
  {
    id: 'status',
    header: 'Outcome',
    sortValue: (r) => r.status,
    cell: (r) => (
      <>
        <StatusBadge status={r.status} />
        {r.decisionNote ? <VisuallyHidden> Note: {r.decisionNote}</VisuallyHidden> : null}
      </>
    ),
  },
  {
    id: 'asked',
    header: 'Asked',
    sortValue: (r) => r.createdAt,
    cell: (r) => formatDateTime(r.createdAt),
  },
]

function PendingList({
  onApprove,
  onDeny,
}: {
  onApprove: (request: AccessRequest) => void
  onDeny: (request: AccessRequest) => void
}) {
  const pending = usePendingRequests()
  const attributes = useAttributes()
  if (pending.isPending) return <LoadingBlock label="Loading requests" />
  if (pending.isError)
    return <ErrorState error={pending.error} onRetry={() => void pending.refetch()} />
  const open = pending.data.filter((r) => r.status === 'PENDING')
  if (open.length === 0)
    return (
      <EmptyState
        illustration={<Illustration name="letter" />}
        title="No requests waiting"
        description="When an app asks to read your data, the request shows up here for you to approve or deny. Nothing is shared until you do."
      />
    )
  return (
    <ul className="card-list" aria-label="Pending requests">
      {open.map((request) => (
        <li key={request.id}>
          <RequestCard
            request={request}
            {...(attributes.data ? { attributes: attributes.data } : {})}
            onApprove={onApprove}
            onDeny={onDeny}
          />
        </li>
      ))}
    </ul>
  )
}

function PastList({ active }: { active: boolean }) {
  const all = useAllRequests(active)
  if (all.isPending) return active ? <LoadingBlock label="Loading past requests" /> : null
  if (all.isError) return <ErrorState error={all.error} onRetry={() => void all.refetch()} />
  const past = all.data.filter((r) => r.status !== 'PENDING')
  if (past.length === 0)
    return (
      <EmptyState
        title="Nothing decided yet"
        description="Requests you approve or deny, and ones that expired, are listed here."
        headingAs="h2"
      />
    )
  return (
    <DataTable
      caption="Past requests"
      columns={pastColumns}
      data={past}
      getRowId={(r) => r.id}
      defaultSort={{ columnId: 'asked', direction: 'desc' }}
    />
  )
}

export function RequestsPage() {
  const [tab, setTab] = useState('pending')
  const [approving, setApproving] = useState<AccessRequest | null>(null)
  const [denying, setDenying] = useState<AccessRequest | null>(null)

  return (
    <>
      <PageHeader
        title="Requests"
        description="Apps ask first. You decide which part of your vault they can read, and for how long."
      />
      <Tabs value={tab} onValueChange={setTab}>
        <TabsList aria-label="Request lists">
          <TabsTrigger value="pending">Pending</TabsTrigger>
          <TabsTrigger value="past">Past requests</TabsTrigger>
        </TabsList>
        <TabsContent value="pending">
          <PendingList onApprove={setApproving} onDeny={setDenying} />
        </TabsContent>
        <TabsContent value="past">
          <PastList active={tab === 'past'} />
        </TabsContent>
      </Tabs>
      <ApproveDialog request={approving} onOpenChange={(open) => !open && setApproving(null)} />
      <DenyDialog request={denying} onOpenChange={(open) => !open && setDenying(null)} />
    </>
  )
}
