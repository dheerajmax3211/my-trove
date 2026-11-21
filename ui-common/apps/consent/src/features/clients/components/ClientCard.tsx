import { Badge, Button, Card, CardContent, CardHeader, CardTitle } from '@platform/ui'
import { ModuleLink } from '@platform/workspace-kit'
import type { Client } from '../../../shared/api/types'
import { ScopeList } from '../../../shared/components/ScopeList'
import { formatDate } from '../../../shared/lib/format'

export interface ClientCardProps {
  client: Client
  onRotate: (client: Client) => void
  onDisable: (client: Client) => void
}

export function ClientCard({ client, onRotate, onDisable }: ClientCardProps) {
  const headingId = `client-${client.clientId}`
  const disabled = client.disabledAt !== null
  return (
    <Card role="group" aria-labelledby={headingId}>
      <CardHeader>
        <CardTitle as="h3" id={headingId}>
          {client.name}
        </CardTitle>
        <Badge variant={disabled ? 'danger' : 'success'} dot>
          {disabled ? 'Disabled' : 'Active'}
        </Badge>
      </CardHeader>
      <CardContent>
        <dl className="facts">
          <div>
            <dt>Client ID</dt>
            <dd>
              <code className="mono">{client.clientId}</code>
            </dd>
          </div>
          <div>
            <dt>May ask for</dt>
            <dd>
              <ScopeList
                scopes={client.allowedScopes}
                label={`Scopes ${client.name} may request`}
              />
            </dd>
          </div>
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
          <div>
            <dt>Secret</dt>
            <dd>
              {client.secretRotatedAt
                ? `Rotated ${formatDate(client.secretRotatedAt)}. The value is never shown again.`
                : 'Issued at registration. The value is never shown again.'}
            </dd>
          </div>
          {disabled && client.disabledAt ? (
            <div>
              <dt>Disabled</dt>
              <dd>{formatDate(client.disabledAt)}</dd>
            </div>
          ) : null}
        </dl>
        <div className="row-wrap">
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
      </CardContent>
    </Card>
  )
}
