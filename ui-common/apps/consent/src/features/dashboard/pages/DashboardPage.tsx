import {
  BentoCard,
  BentoGrid,
  BigStat,
  Button,
  InboxIcon,
  KeyIcon,
  PageHeader,
  Skeleton,
} from '@platform/ui'
import { ModuleLink } from '@platform/workspace-kit'
import { useState } from 'react'
import type { AccessRequest, Grant } from '../../../shared/api/types'
import { ErrorState } from '../../../shared/components/ErrorState'
import { formatReads, formatRelative } from '../../../shared/lib/format'
import { useClients } from '../../clients/hooks/useClients'
import { RevokeDialog } from '../../grants/components/RevokeDialog'
import { ApproveDialog } from '../../requests/components/ApproveDialog'
import { DenyDialog } from '../../requests/components/DenyDialog'
import { usePendingRequests } from '../../requests/hooks/useRequests'
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
  const pending = usePendingRequests()
  const [approving, setApproving] = useState<AccessRequest | null>(null)
  const [denying, setDenying] = useState<AccessRequest | null>(null)
  const [revoking, setRevoking] = useState<Grant | null>(null)

  const nameOf = (id: string | null) =>
    id ? (clients.data?.find((c) => c.clientId === id)?.name ?? id) : 'You'

  const data = dashboard.data
  const summary = data
    ? homeSummary(data.pendingRequests, data.activeGrants.length)
    : FALLBACK_DESCRIPTION
  // The product line stays on the first screen for everyone, not only on the empty first run.
  const description = `${summary} Decide who can read which part of your data, and take it back any time.`
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
        <BentoGrid>
          <BentoCard span={4} title="Waiting for you" icon={<InboxIcon size={18} />}>
            <BigStat
              value={data.pendingRequests}
              unit={data.pendingRequests === 1 ? 'request' : 'requests'}
              {...(data.pendingRequests > 0 ? { delta: 'Needs a decision' } : {})}
              caption={data.pendingRequests === 0 ? 'Nothing to decide' : 'Waiting for your answer'}
            />
            <ul className="mini-list" aria-label="Who is asking">
              {(pending.data ?? [])
                .filter((r) => r.status === 'PENDING')
                .slice(0, 3)
                .map((r) => (
                  <li key={r.id}>
                    <span className="request-seal" aria-hidden="true">
                      {Array.from(r.clientName)[0]?.toUpperCase() ?? '?'}
                    </span>
                    <span className="mini-main">{r.clientName}</span>
                    <span className="muted">{formatRelative(r.createdAt)}</span>
                  </li>
                ))}
            </ul>
            <div className="card-actions">
              <Button size="sm" variant="secondary" asChild>
                <ModuleLink to="/requests">Open requests</ModuleLink>
              </Button>
            </div>
          </BentoCard>
          <BentoCard span={4} title="Apps with access" icon={<KeyIcon size={18} />}>
            <BigStat
              value={data.activeGrants.length}
              unit={data.activeGrants.length === 1 ? 'app' : 'apps'}
              trend="flat"
              caption={nextEnd ? `Next one ends ${formatRelative(nextEnd)}` : 'No active grants'}
            />
            <ul className="mini-list" aria-label="Apps holding a key">
              {data.activeGrants.slice(0, 3).map((g) => (
                <li key={g.id}>
                  <span className="request-seal" aria-hidden="true">
                    {Array.from(g.clientName)[0]?.toUpperCase() ?? '?'}
                  </span>
                  <span className="mini-main">{g.clientName}</span>
                  <span className="muted">{formatReads(g.readsUsed, g.maxReads)}</span>
                </li>
              ))}
            </ul>
          </BentoCard>
          <VaultPanel />
        </BentoGrid>
        <PendingBand
          attributes={attributes.data}
          expected={data.pendingRequests}
          onApprove={setApproving}
          onDeny={setDenying}
        />
        <GrantsPanel grants={data.activeGrants} onRevoke={setRevoking} />
        <BentoGrid>
          <ChainPanel />
          <ActivityPanel entries={data.recentAccess} nameOf={nameOf} />
        </BentoGrid>
      </div>
    )
  }

  return (
    <>
      <PageHeader title="Who can see what" description={description} />
      {body}
      <ApproveDialog request={approving} onOpenChange={(open) => !open && setApproving(null)} />
      <DenyDialog request={denying} onOpenChange={(open) => !open && setDenying(null)} />
      <RevokeDialog grant={revoking} onOpenChange={(open) => !open && setRevoking(null)} />
    </>
  )
}
