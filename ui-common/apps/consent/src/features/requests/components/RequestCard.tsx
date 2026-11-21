import { Button, KeyValueList, type KeyValueItem } from '@platform/ui'
import type { AccessRequest, Attribute } from '../../../shared/api/types'
import { ScopeList } from '../../../shared/components/ScopeList'
import { StatusBadge } from '../../../shared/components/StatusBadge'
import { formatDuration, formatHours, formatRelative } from '../../../shared/lib/format'
import { describeAsk, requestExpiresAt } from '../../../shared/lib/requests'
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
 * One access request, set out as the trust moment it is: who is asking, in a sentence what they ask for,
 * why, and what it covers in your vault. Works on paper or on the vault surface.
 */
export function RequestCard({ request, attributes, onApprove, onDeny }: RequestCardProps) {
  const headingId = `request-${request.id}`
  const open = request.status === 'PENDING'
  const facts: KeyValueItem[] = [
    { id: 'for', label: 'For', value: formatDuration(request.durationSeconds) },
    {
      id: 'reads',
      label: 'Reads',
      value: request.maxReads === null ? 'No limit' : `Up to ${request.maxReads}`,
    },
    ...(request.allowedHours
      ? [{ id: 'hours', label: 'Only during', value: formatHours(request.allowedHours) }]
      : []),
  ]
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
          <p className="request-ask">{describeAsk(request)}</p>
        </div>
        {open ? null : <StatusBadge status={request.status} />}
      </div>

      <div className="request-body">
        <p className="request-why">
          <span className="request-label">Purpose</span>
          {request.purpose}
        </p>
        <div>
          <p className="request-label">Wants to read</p>
          <ScopeList scopes={request.scopes} label={`Scopes requested by ${request.clientName}`} />
          {attributes ? (
            <p className="muted request-coverage">{coverageSentence(request, attributes)}</p>
          ) : null}
        </div>
        <KeyValueList
          items={facts}
          layout="stacked"
          dense
          divided={false}
          className="request-facts"
        />
      </div>

      {open ? (
        <p className="muted request-clock">
          Asked {formatRelative(request.createdAt)}. If you do nothing it expires{' '}
          {formatRelative(requestExpiresAt(request))}. Nothing is shared until you approve.
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
