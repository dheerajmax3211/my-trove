import { Badge, Button } from '@platform/ui'
import { ModuleLink } from '@platform/workspace-kit'
import type { Client } from '../../../shared/api/types'
import { ScopeList } from '../../../shared/components/ScopeList'
import { formatDate } from '../../../shared/lib/format'

export interface ClientCardProps {
  client: Client
  onRotate: (client: Client) => void
  onDisable: (client: Client) => void
}

/** One registered app in its own card: who it is, what it may ask for, and the three things you can do. */
export function ClientCard({ client, onRotate, onDisable }: ClientCardProps) {
  const headingId = `client-${client.clientId}`
  const disabled = client.disabledAt !== null
  return (
    <div
      role="group"
      aria-labelledby={headingId}
      className="grant-card"
      data-status={disabled ? 'REVOKED' : 'ACTIVE'}
    >
      <div className="grant-head">
        <span className="request-seal" aria-hidden="true">
          {Array.from(client.name)[0]?.toUpperCase() ?? '?'}
        </span>
        <h3 id={headingId} className="grant-name">
          {client.name}
        </h3>
        <Badge variant={disabled ? 'danger' : 'success'} dot>
          {disabled ? 'Disabled' : 'Active'}
        </Badge>
      </div>
      <div>
        <p className="request-label">May ask for</p>
        <ScopeList scopes={client.allowedScopes} label={`Scopes ${client.name} may request`} />
      </div>
      <dl className="grant-facts">
        {client.contactEmail ? (
          <div>
            <dt>Contact</dt>
            <dd>{client.contactEmail}</dd>
          </div>
        ) : null}
        <div>
          <dt>Registered</dt>
          <dd>{formatDate(client.createdAt)}</dd>
        </div>
        {disabled && client.disabledAt ? (
          <div>
            <dt>Disabled</dt>
            <dd>{formatDate(client.disabledAt)}</dd>
          </div>
        ) : null}
        <div className="wide">
          <dt>Client ID</dt>
          <dd>
            <code className="mono">{client.clientId}</code>
          </dd>
        </div>
        <div className="wide">
          <dt>Secret</dt>
          <dd>
            {client.secretRotatedAt
              ? `Rotated ${formatDate(client.secretRotatedAt)}. The value is never shown again.`
              : 'Issued at registration. The value is never shown again.'}
          </dd>
        </div>
      </dl>
      <div className="grant-actions">
        <Button variant="secondary" asChild>
          <ModuleLink
            to={`/history?client=${encodeURIComponent(client.clientId)}`}
            aria-label={`View activity for ${client.name}`}
          >
            View activity
          </ModuleLink>
        </Button>
        {!disabled ? (
          <>
            <Button
              variant="secondary"
              aria-label={`Rotate secret for ${client.name}`}
              onClick={() => onRotate(client)}
            >
              Rotate secret
            </Button>
            <Button
              variant="danger"
              aria-label={`Disable ${client.name}`}
              onClick={() => onDisable(client)}
            >
              Disable app
            </Button>
          </>
        ) : null}
      </div>
    </div>
  )
}
