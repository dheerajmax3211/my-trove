import { Button, EmptyState, Illustration } from '@platform/ui'
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
      <div className="grant-main">
        <div className="grant-who">
          <strong className="grant-name">{grant.clientName}</strong>
          <SensitivityBadge level={grant.maxSensitivity} />
        </div>
        <ScopeList scopes={grant.scopes} label={`Scopes granted to ${grant.clientName}`} />
        <p className="muted">{grant.purpose}</p>
      </div>
      <div className="grant-terms">
        <p className="grant-until">
          Until {formatDate(grant.expiresAt)}
          <span className="muted"> ({formatRelative(grant.expiresAt)})</span>
        </p>
        <span className="lease" aria-hidden="true">
          <span className="lease-used" style={{ width: `${Math.round(elapsed * 100)}%` }} />
        </span>
        <p className="muted">{formatReads(grant.readsUsed, grant.maxReads)}</p>
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

/** Who holds a key right now: the app, which slice of data, until when, one click to take it back. */
export function GrantsPanel({ grants, onRevoke }: GrantsPanelProps) {
  const [now] = useState(() => Date.now())
  return (
    <section className="ledger" aria-labelledby="grants-title">
      <div className="ledger-head">
        <h2 id="grants-title" className="ledger-title">
          Who has access now
        </h2>
        <ModuleLink to="/grants" className="ledger-link">
          Manage grants
        </ModuleLink>
      </div>
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
    </section>
  )
}
