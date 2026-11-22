import { BentoCard, Button, EmptyState, Illustration, KeyIcon } from '@platform/ui'
import { ModuleLink } from '@platform/workspace-kit'
import { useState } from 'react'
import type { Grant } from '../../../shared/api/types'
import { ScopeList } from '../../../shared/components/ScopeList'
import { SensitivityBadge } from '../../../shared/components/SensitivityBadge'
import { formatDate, formatReads, formatRelative } from '../../../shared/lib/format'
import { leaseElapsed } from '../summary'

function GrantRow({
  grant,
  now,
  onRevoke,
}: {
  grant: Grant
  now: number
  onRevoke: (grant: Grant) => void
}) {
  const elapsed = leaseElapsed(grant, now)
  return (
    <li className="grant-row">
      <div className="grant-head">
        <span className="request-seal" aria-hidden="true">
          {Array.from(grant.clientName)[0]?.toUpperCase() ?? '?'}
        </span>
        <strong className="grant-name">{grant.clientName}</strong>
        <SensitivityBadge level={grant.maxSensitivity} />
      </div>
      <ScopeList scopes={grant.scopes} label={`Scopes granted to ${grant.clientName}`} />
      <p className="grant-purpose">{grant.purpose}</p>
      <div className="stack-sm">
        <span className="lease" aria-hidden="true">
          <span className="lease-used" style={{ width: `${Math.round(elapsed * 100)}%` }} />
        </span>
        <div className="grant-meta">
          <p className="grant-until">
            Until {formatDate(grant.expiresAt)}
            <span className="muted"> ({formatRelative(grant.expiresAt)})</span>
          </p>
          <p className="muted">{formatReads(grant.readsUsed, grant.maxReads)}</p>
        </div>
      </div>
      <div className="grant-actions">
        <Button
          size="sm"
          variant="secondary"
          aria-label={`Revoke access for ${grant.clientName}`}
          onClick={() => onRevoke(grant)}
        >
          Revoke access
        </Button>
      </div>
    </li>
  )
}

export interface GrantsPanelProps {
  grants: readonly Grant[]
  onRevoke: (grant: Grant) => void
}

/** Who holds a key right now: the app, which slice of data, how much of the lease is gone, one click to take it back. */
export function GrantsPanel({ grants, onRevoke }: GrantsPanelProps) {
  const [now] = useState(() => Date.now())
  return (
    <BentoCard
      span={7}
      rowSpan={2}
      title="Who has access now"
      icon={<KeyIcon size={18} />}
      actions={
        <ModuleLink to="/grants" className="section-link" style={{ marginInlineStart: 0 }}>
          Manage grants
        </ModuleLink>
      }
    >
      {grants.length === 0 ? (
        <EmptyState
          illustration={<Illustration name="key" size={160} />}
          title="No app has access"
          description="Nothing you hold is readable by anyone else right now. Apps have to ask, and you have to approve."
          headingAs="h3"
        />
      ) : (
        <ul className="grant-list" aria-label="Active grants">
          {grants.map((grant) => (
            <GrantRow key={grant.id} grant={grant} now={now} onRevoke={onRevoke} />
          ))}
        </ul>
      )}
    </BentoCard>
  )
}
