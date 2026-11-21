import {
  EmptyState,
  InboxIcon,
  PageHeader,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from '@platform/ui'
import { useState } from 'react'
import type { Grant } from '../../../shared/api/types'
import { ErrorState } from '../../../shared/components/ErrorState'
import { LoadingBlock } from '../../../shared/components/LoadingBlock'
import { GrantCard } from '../components/GrantCard'
import { RevokeDialog } from '../components/RevokeDialog'
import { useGrants } from '../hooks/useGrants'

function GrantList({
  includeInactive,
  onRevoke,
}: {
  includeInactive: boolean
  onRevoke: (grant: Grant) => void
}) {
  const grants = useGrants(includeInactive)
  if (grants.isPending) return <LoadingBlock label="Loading grants" />
  if (grants.isError)
    return <ErrorState error={grants.error} onRetry={() => void grants.refetch()} />
  if (grants.data.length === 0)
    return (
      <EmptyState
        icon={<InboxIcon size={24} />}
        title={includeInactive ? 'No grants yet' : 'No app has access right now'}
        description="When you approve a request, the access it creates is listed here, and you can revoke it at any time."
      />
    )
  return (
    <ul className="card-list" aria-label={includeInactive ? 'All grants' : 'Active grants'}>
      {grants.data.map((grant) => (
        <li key={grant.id}>
          <GrantCard grant={grant} onRevoke={onRevoke} />
        </li>
      ))}
    </ul>
  )
}

export function GrantsPage() {
  const [tab, setTab] = useState('active')
  const [revoking, setRevoking] = useState<Grant | null>(null)
  return (
    <>
      <PageHeader
        title="Grants"
        description="Who can read what right now. Revoking takes effect on the very next read."
      />
      <Tabs value={tab} onValueChange={setTab}>
        <TabsList aria-label="Grant lists">
          <TabsTrigger value="active">Active</TabsTrigger>
          <TabsTrigger value="all">All, including ended</TabsTrigger>
        </TabsList>
        <TabsContent value="active">
          <GrantList includeInactive={false} onRevoke={setRevoking} />
        </TabsContent>
        <TabsContent value="all">
          <GrantList includeInactive onRevoke={setRevoking} />
        </TabsContent>
      </Tabs>
      <RevokeDialog grant={revoking} onOpenChange={(open) => !open && setRevoking(null)} />
    </>
  )
}
