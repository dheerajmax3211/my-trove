import { Button } from '@platform/ui'
import { useState } from 'react'
import type { Grant } from '../../../shared/api/types'
import { ScopeList } from '../../../shared/components/ScopeList'
import { SensitivityBadge } from '../../../shared/components/SensitivityBadge'
import { StatusBadge } from '../../../shared/components/StatusBadge'
import {
  formatDate,
  formatDateTime,
  formatHours,
  formatReads,
  formatRelative,
} from '../../../shared/lib/format'
import { leaseElapsed } from '../../dashboard/summary'

export interface GrantCardProps {
  grant: Grant
  onRevoke?: (grant: Grant) => void
}

/** One grant, in its own card: who may read what, why, how much of the lease is gone, and a revoke button. */
export function GrantCard({ grant, onRevoke }: GrantCardProps) {
  const headingId = `grant-${grant.id}`
  const [now] = useState(() => Date.now())
  const active = grant.status === 'ACTIVE'
  const ended = grant.status === 'REVOKED' ? grant.revokedAt : grant.expiresAt
  const elapsed = leaseElapsed(grant, now)
  return (
    <div
      role="group"
      aria-labelledby={headingId}
      className="grant-card"
      data-status={grant.status}
    >
      <div className="grant-head">
        <span className="request-seal" aria-hidden="true">
          {Array.from(grant.clientName)[0]?.toUpperCase() ?? '?'}
        </span>
        <h3 id={headingId} className="grant-name">
          {grant.clientName}
        </h3>
        <StatusBadge status={grant.status} />
      </div>
      <p className="grant-purpose">{grant.purpose}</p>
      <div>
        <p className="request-label">Can read</p>
        <ScopeList scopes={grant.scopes} label={`Scopes granted to ${grant.clientName}`} />
      </div>
      <div className="stack-sm">
        <span className="lease" aria-hidden="true">
          <span
            className="lease-used"
            style={{ width: `${Math.round((active ? elapsed : 1) * 100)}%` }}
          />
        </span>
        <div className="grant-meta">
          <p className="grant-until">
            {active ? 'Expires' : grant.status === 'REVOKED' ? 'Revoked' : 'Expired'}{' '}
            {ended ? formatDate(ended) : 'never'}
          </p>
          <p className="muted">{ended ? formatRelative(ended) : ''}</p>
        </div>
      </div>
      <dl className="grant-facts">
        <div>
          <dt>Reads</dt>
          <dd>{formatReads(grant.readsUsed, grant.maxReads)}</dd>
        </div>
        <div>
          <dt>Up to</dt>
          <dd>
            <SensitivityBadge level={grant.maxSensitivity} />
          </dd>
        </div>
        {grant.lastReadAt ? (
          <div>
            <dt>Last read</dt>
            <dd title={formatDateTime(grant.lastReadAt)}>{formatRelative(grant.lastReadAt)}</dd>
          </div>
        ) : null}
        {grant.allowedHours ? (
          <div>
            <dt>Only during</dt>
            <dd>{formatHours(grant.allowedHours)}</dd>
          </div>
        ) : null}
      </dl>
      {onRevoke && active ? (
        <div className="grant-actions">
          <Button
            variant="secondary"
            aria-label={`Revoke access for ${grant.clientName}`}
            onClick={() => onRevoke(grant)}
          >
            Revoke access
          </Button>
        </div>
      ) : null}
    </div>
  )
}
