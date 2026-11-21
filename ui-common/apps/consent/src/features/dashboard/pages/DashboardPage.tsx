import { PageHeader, Skeleton, Stat } from '@platform/ui'
import { useState } from 'react'
import type { AccessRequest, Grant } from '../../../shared/api/types'
import { ErrorState } from '../../../shared/components/ErrorState'
import { formatRelative } from '../../../shared/lib/format'
import { useClients } from '../../clients/hooks/useClients'
import { RevokeDialog } from '../../grants/components/RevokeDialog'
import { ApproveDialog } from '../../requests/components/ApproveDialog'
import { DenyDialog } from '../../requests/components/DenyDialog'
import { useAttributes } from '../../vault/hooks/useVault'
import { ActivityPanel } from '../components/ActivityPanel'
import { ChainPanel } from '../components/ChainPanel'
import { FirstRun } from '../components/FirstRun'
import { GrantsPanel } from '../components/GrantsPanel'
import { PendingBand } from '../components/PendingBand'
import { VaultPanel } from '../components/VaultPanel'
import { useDashboard } from '../hooks/useDashboard'
import { homeSummary } from '../summary'

const FALLBACK_DESCRIPTION =
  'Who can read your vault, what is waiting for a decision, and whether the record can be trusted.'

export function DashboardPage() {
  const dashboard = useDashboard()
  const attributes = useAttributes()
  const clients = useClients()
  const [approving, setApproving] = useState<AccessRequest | null>(null)
  const [denying, setDenying] = useState<AccessRequest | null>(null)
  const [revoking, setRevoking] = useState<Grant | null>(null)

  const nameOf = (id: string | null) =>
    id ? (clients.data?.find((c) => c.clientId === id)?.name ?? id) : 'You'

  const data = dashboard.data
  const description = data
    ? homeSummary(data.pendingRequests, data.activeGrants.length)
    : FALLBACK_DESCRIPTION
  const firstRun =
    data !== undefined &&
    attributes.data !== undefined &&
    attributes.data.length === 0 &&
    data.pendingRequests === 0 &&
    data.activeGrants.length === 0 &&
    data.recentAccess.length === 0

  let body
  if (dashboard.isError) {
    body = <ErrorState error={dashboard.error} onRetry={() => void dashboard.refetch()} />
  } else if (!data) {
    body = (
      <div className="home-loading" aria-busy="true">
        <Skeleton height="12rem" />
        <Skeleton height="6rem" />
        <Skeleton height="14rem" />
      </div>
    )
  } else if (firstRun) {
    body = <FirstRun />
  } else {
    const nextEnd = data.activeGrants
      .map((g) => g.expiresAt)
      .sort()
      .at(0)
    body = (
      <div className="home">
        <PendingBand
          attributes={attributes.data}
          expected={data.pendingRequests}
          onApprove={setApproving}
          onDeny={setDenying}
        />
        <div className="home-stats">
          <Stat
            label="Waiting for you"
            value={data.pendingRequests}
            hint={data.pendingRequests === 0 ? 'Nothing to decide' : 'Needs a decision'}
          />
          <Stat
            label="Apps with access"
            value={data.activeGrants.length}
            hint={nextEnd ? `Next one ends ${formatRelative(nextEnd)}` : 'No active grants'}
          />
          <Stat
            label="Attributes in your vault"
            value={attributes.data ? attributes.data.length : '–'}
            hint="Facts you could lend"
          />
        </div>
        <div className="home-columns">
          <div className="home-main">
            <GrantsPanel grants={data.activeGrants} onRevoke={setRevoking} />
            <ActivityPanel entries={data.recentAccess} nameOf={nameOf} />
          </div>
          <div className="home-side">
            <VaultPanel />
            <ChainPanel />
          </div>
        </div>
      </div>
    )
  }

  return (
    <>
      <PageHeader eyebrow="Consent" title="Who can see what" description={description} />
      {body}
      <ApproveDialog request={approving} onOpenChange={(open) => !open && setApproving(null)} />
      <DenyDialog request={denying} onOpenChange={(open) => !open && setDenying(null)} />
      <RevokeDialog grant={revoking} onOpenChange={(open) => !open && setRevoking(null)} />
    </>
  )
}
