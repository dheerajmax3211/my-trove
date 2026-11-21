import { Button, Card, CardContent, CardHeader, CardTitle } from '@platform/ui'
import type { Grant } from '../../../shared/api/types'
import { ScopeList } from '../../../shared/components/ScopeList'
import { SensitivityBadge } from '../../../shared/components/SensitivityBadge'
import { StatusBadge } from '../../../shared/components/StatusBadge'
import {
  formatDateTime,
  formatHours,
  formatReads,
  formatRelative,
} from '../../../shared/lib/format'

export interface GrantCardProps {
  grant: Grant
  onRevoke?: (grant: Grant) => void
}

/** One grant: who may read what, why, until when, and how much of the read budget is used. */
export function GrantCard({ grant, onRevoke }: GrantCardProps) {
  const headingId = `grant-${grant.id}`
  const ended = grant.status === 'REVOKED' ? grant.revokedAt : grant.expiresAt
  return (
    <Card role="group" aria-labelledby={headingId}>
      <CardHeader>
        <CardTitle as="h3" id={headingId}>
          {grant.clientName}
        </CardTitle>
        <StatusBadge status={grant.status} />
      </CardHeader>
      <CardContent>
        <dl className="facts">
          <div>
            <dt>Can read</dt>
            <dd>
              <ScopeList scopes={grant.scopes} label={`Scopes granted to ${grant.clientName}`} />
            </dd>
          </div>
          <div>
            <dt>Purpose</dt>
            <dd>{grant.purpose}</dd>
          </div>
          <div>
            <dt>Up to</dt>
            <dd>
              <SensitivityBadge level={grant.maxSensitivity} />
            </dd>
          </div>
          <div>
            <dt>
              {grant.status === 'ACTIVE'
                ? 'Expires'
                : grant.status === 'REVOKED'
                  ? 'Revoked'
                  : 'Expired'}
            </dt>
            <dd>{ended ? `${formatDateTime(ended)} (${formatRelative(ended)})` : 'Never'}</dd>
          </div>
          <div>
            <dt>Reads</dt>
            <dd>{formatReads(grant.readsUsed, grant.maxReads)}</dd>
          </div>
          {grant.lastReadAt ? (
            <div>
              <dt>Last read</dt>
              <dd>{formatRelative(grant.lastReadAt)}</dd>
            </div>
          ) : null}
          {grant.allowedHours ? (
            <div>
              <dt>Only during</dt>
              <dd>{formatHours(grant.allowedHours)}</dd>
            </div>
          ) : null}
        </dl>
        {onRevoke && grant.status === 'ACTIVE' ? (
          <div className="row-wrap">
            <Button
              variant="secondary"
              aria-label={`Revoke access for ${grant.clientName}`}
              onClick={() => onRevoke(grant)}
            >
              Revoke access
            </Button>
          </div>
        ) : null}
      </CardContent>
    </Card>
  )
}
