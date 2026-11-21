import { Button, Card, CardContent, CardHeader, CardTitle } from '@platform/ui'
import type { AccessRequest } from '../../../shared/api/types'
import { ScopeList } from '../../../shared/components/ScopeList'
import { StatusBadge } from '../../../shared/components/StatusBadge'
import { formatDuration, formatHours, formatRelative } from '../../../shared/lib/format'

export interface RequestCardProps {
  request: AccessRequest
  onApprove?: (request: AccessRequest) => void
  onDeny?: (request: AccessRequest) => void
}

/** One access request: who, what, why and for how long, with the decision buttons when still open. */
export function RequestCard({ request, onApprove, onDeny }: RequestCardProps) {
  const headingId = `request-${request.id}`
  return (
    <Card role="group" aria-labelledby={headingId}>
      <CardHeader>
        <CardTitle as="h3" id={headingId}>
          {request.clientName}
        </CardTitle>
        <StatusBadge status={request.status} />
      </CardHeader>
      <CardContent>
        <dl className="facts">
          <div>
            <dt>Purpose</dt>
            <dd>{request.purpose}</dd>
          </div>
          <div>
            <dt>Wants to read</dt>
            <dd>
              <ScopeList
                scopes={request.scopes}
                label={`Scopes requested by ${request.clientName}`}
              />
            </dd>
          </div>
          <div>
            <dt>For</dt>
            <dd>{formatDuration(request.durationSeconds)}</dd>
          </div>
          <div>
            <dt>Reads</dt>
            <dd>{request.maxReads === null ? 'No limit' : `Up to ${request.maxReads}`}</dd>
          </div>
          {request.allowedHours ? (
            <div>
              <dt>Only during</dt>
              <dd>{formatHours(request.allowedHours)}</dd>
            </div>
          ) : null}
          <div>
            <dt>Asked</dt>
            <dd>{formatRelative(request.createdAt)}</dd>
          </div>
        </dl>
        {onApprove || onDeny ? (
          <div className="row-wrap">
            {onApprove ? (
              <Button
                aria-label={`Review and approve ${request.clientName}`}
                onClick={() => onApprove(request)}
              >
                Review and approve
              </Button>
            ) : null}
            {onDeny ? (
              <Button
                variant="secondary"
                aria-label={`Deny ${request.clientName}`}
                onClick={() => onDeny(request)}
              >
                Deny
              </Button>
            ) : null}
          </div>
        ) : null}
      </CardContent>
    </Card>
  )
}
