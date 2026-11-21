import {
  Badge,
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  EmptyState,
  PageHeader,
  Skeleton,
} from '@platform/ui'
import { ModuleLink } from '@platform/workspace-kit'
import type { Grant } from '../../../shared/api/types'
import { ErrorState } from '../../../shared/components/ErrorState'
import { ScopeList } from '../../../shared/components/ScopeList'
import { eventLabel, summarizeEntry } from '../../../shared/lib/audit'
import { formatDateTime, formatReads, formatRelative } from '../../../shared/lib/format'
import { ChainResult } from '../../audit/components/ChainResult'
import { useChainVerification } from '../../audit/hooks/useChain'
import { useClients } from '../../clients/hooks/useClients'
import { useDashboard } from '../hooks/useDashboard'

function GrantRow({ grant }: { grant: Grant }) {
  return (
    <li className="compact-row">
      <div className="stack-sm">
        <strong>{grant.clientName}</strong>
        <ScopeList scopes={grant.scopes} label={`Scopes granted to ${grant.clientName}`} />
      </div>
      <div className="muted compact-meta">
        <span>Expires {formatRelative(grant.expiresAt)}</span>
        <span>{formatReads(grant.readsUsed, grant.maxReads)}</span>
      </div>
    </li>
  )
}

function ChainCard() {
  const chain = useChainVerification({ autoRun: true })
  return (
    <Card>
      <CardHeader>
        <CardTitle as="h2">Audit chain</CardTitle>
        <CardDescription>Is the record of who read what still intact?</CardDescription>
      </CardHeader>
      <CardContent>
        {chain.isPending ? (
          <Skeleton height="4rem" />
        ) : chain.isError ? (
          <ErrorState error={chain.error} onRetry={() => void chain.refetch()} />
        ) : (
          <ChainResult report={chain.data} checkedAt={chain.dataUpdatedAt} />
        )}
        <div className="row-wrap">
          <Button variant="secondary" asChild>
            <ModuleLink to="/audit">Open audit</ModuleLink>
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}

export function DashboardPage() {
  const dashboard = useDashboard()
  const clients = useClients()
  const nameOf = (id: string | null) =>
    id ? (clients.data?.find((c) => c.clientId === id)?.name ?? id) : 'You'

  return (
    <>
      <PageHeader
        title="Overview"
        description="Who can see your data right now, what is waiting for a decision, and whether the record can be trusted."
      />
      {dashboard.isError ? (
        <ErrorState error={dashboard.error} onRetry={() => void dashboard.refetch()} />
      ) : (
        <div className="dashboard-grid">
          <Card>
            <CardHeader>
              <CardTitle as="h2">Waiting for you</CardTitle>
              <CardDescription>Requests from apps that need a decision.</CardDescription>
            </CardHeader>
            <CardContent>
              {dashboard.isPending ? (
                <Skeleton height="3rem" />
              ) : (
                <>
                  <p
                    className="big-number"
                    aria-label={`${dashboard.data.pendingRequests} pending requests`}
                  >
                    {dashboard.data.pendingRequests}
                  </p>
                  <p className="muted">
                    {dashboard.data.pendingRequests === 0
                      ? 'Nothing is waiting.'
                      : dashboard.data.pendingRequests === 1
                        ? '1 request is waiting for your decision.'
                        : `${dashboard.data.pendingRequests} requests are waiting for your decision.`}
                  </p>
                  <div className="row-wrap">
                    <Button
                      asChild
                      variant={dashboard.data.pendingRequests > 0 ? 'primary' : 'secondary'}
                    >
                      <ModuleLink to="/requests">Open requests</ModuleLink>
                    </Button>
                  </div>
                </>
              )}
            </CardContent>
          </Card>

          <ChainCard />

          <Card className="span-all">
            <CardHeader>
              <CardTitle as="h2">Who has access now</CardTitle>
              <CardDescription>
                Active grants, with what they can read and how much is used.
              </CardDescription>
            </CardHeader>
            <CardContent>
              {dashboard.isPending ? (
                <Skeleton height="6rem" />
              ) : dashboard.data.activeGrants.length === 0 ? (
                <EmptyState
                  title="No app has access"
                  description="Nothing you hold is readable by anyone else right now."
                  headingAs="h3"
                />
              ) : (
                <ul className="compact-list" aria-label="Active grants">
                  {dashboard.data.activeGrants.map((grant) => (
                    <GrantRow key={grant.id} grant={grant} />
                  ))}
                </ul>
              )}
              <div className="row-wrap">
                <Button variant="secondary" asChild>
                  <ModuleLink to="/grants">Manage grants</ModuleLink>
                </Button>
              </div>
            </CardContent>
          </Card>

          <Card className="span-all">
            <CardHeader>
              <CardTitle as="h2">Recent activity</CardTitle>
              <CardDescription>The last few entries in the audit log.</CardDescription>
            </CardHeader>
            <CardContent>
              {dashboard.isPending ? (
                <Skeleton height="6rem" />
              ) : dashboard.data.recentAccess.length === 0 ? (
                <EmptyState
                  title="No activity yet"
                  description="Reads, refusals and changes will show up here."
                  headingAs="h3"
                />
              ) : (
                <ul className="compact-list" aria-label="Recent activity">
                  {dashboard.data.recentAccess.map((entry) => (
                    <li key={entry.seq} className="compact-row">
                      <div className="stack-sm">
                        <span>
                          <Badge variant={entry.eventType === 'DATA_DENIED' ? 'danger' : 'neutral'}>
                            {eventLabel(entry.eventType)}
                          </Badge>{' '}
                          {entry.actorType === 'CLIENT' ? nameOf(entry.clientId) : 'You'}
                        </span>
                        <span className="muted">{summarizeEntry(entry)}</span>
                      </div>
                      <span className="muted compact-meta">{formatDateTime(entry.occurredAt)}</span>
                    </li>
                  ))}
                </ul>
              )}
              <div className="row-wrap">
                <Button variant="secondary" asChild>
                  <ModuleLink to="/history">See all history</ModuleLink>
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </>
  )
}
