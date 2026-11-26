import { Badge, Button } from '@platform/ui'
import type { AccessRequest, Attribute } from '../../../shared/api/types'
import { ScopeList } from '../../../shared/components/ScopeList'
import { StatusBadge } from '../../../shared/components/StatusBadge'
import { formatDuration, formatHours, formatRelative } from '../../../shared/lib/format'
import { describeAsk } from '../../../shared/lib/requests'
import { computeVisibility } from '../api/approval'

export interface RequestCardProps {
  request: AccessRequest
  /** Your vault, so the card can say how much of it the request touches. Omit to leave that out. */
  attributes?: readonly Attribute[]
  onApprove?: (request: AccessRequest) => void
  onDeny?: (request: AccessRequest) => void
}

function coverageSentence(request: AccessRequest, attributes: readonly Attribute[]): string {
  const { released, withheld } = computeVisibility(attributes, request.scopes, 'SENSITIVE')
  if (released.length === 0 && withheld.length === 0)
    return 'Nothing in your vault matches this yet.'
  const base = `Matches ${released.length} ${released.length === 1 ? 'attribute' : 'attributes'} in your vault today`
  return withheld.length > 0
    ? `${base}. ${withheld.length} more would be withheld as too sensitive.`
    : `${base}.`
}

/**
 * One access request, in its own card: who is asking, in a sentence what they ask for, why, which
 * slices, for how long, and the two decisions. Nothing is shared until you approve.
 */
export function RequestCard({ request, attributes, onApprove, onDeny }: RequestCardProps) {
  const headingId = `request-${request.id}`
  const open = request.status === 'PENDING'
  return (
    <div role="group" aria-labelledby={headingId} className="request" data-status={request.status}>
      <div className="request-head">
        <span className="request-seal" aria-hidden="true">
          {Array.from(request.clientName)[0]?.toUpperCase() ?? '?'}
        </span>
        <div className="request-who">
          <h3 id={headingId} className="request-name">
            {request.clientName}
          </h3>
          <p className="request-time">Asked {formatRelative(request.createdAt)}</p>
        </div>
        {open ? (
          <Badge variant="accent" dot>
            Needs you
          </Badge>
        ) : (
          <StatusBadge status={request.status} />
        )}
      </div>

      <p className="request-ask">{describeAsk(request)}</p>

      <div className="request-purpose">
        <p className="request-why">
          <span className="request-label">Purpose</span>
          {request.purpose}
        </p>
      </div>

      <div>
        <p className="request-label">Slices it asks for</p>
        <ScopeList scopes={request.scopes} label={`Scopes requested by ${request.clientName}`} />
        {attributes ? (
          <p className="muted request-coverage">{coverageSentence(request, attributes)}</p>
        ) : null}
      </div>

      <dl className="request-facts">
        <div className="request-fact">
          <dt>For</dt>
          <dd>{formatDuration(request.durationSeconds)}</dd>
        </div>
        <div className="request-fact">
          <dt>Reads</dt>
          <dd>{request.maxReads === null ? 'No limit' : `Up to ${request.maxReads}`}</dd>
        </div>
        {request.allowedHours ? (
          <div className="request-fact">
            <dt>Only during</dt>
            <dd>{formatHours(request.allowedHours)}</dd>
          </div>
        ) : null}
      </dl>

      {open && request.expiresAt ? (
        <p className="muted request-clock">
          If you do nothing it expires {formatRelative(request.expiresAt)}. Nothing is shared until
          you approve.
        </p>
      ) : null}
      {onApprove || onDeny ? (
        <div className="request-actions">
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
    </div>
  )
}
