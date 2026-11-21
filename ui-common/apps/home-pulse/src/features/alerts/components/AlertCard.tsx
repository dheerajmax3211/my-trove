import { Button, Card, CardContent, CardHeader, CardTitle, CheckIcon, useToast } from '@platform/ui'
import { ModuleLink } from '@platform/workspace-kit'
import { useClock } from '../../../lib/clock'
import { errorMessage } from '../../../lib/errors'
import { formatRelative } from '../../../lib/format'
import { alertContext, describeAlert, KIND_LABELS } from '../evidence'
import { useAcknowledgeAlert } from '../hooks'
import type { AlertDto } from '../types'
import { AlertStatusBadge, SeverityBadge } from './AlertBadges'

export interface AlertCardProps {
  alert: AlertDto
  /** Hide the appliance link when the list is already about one appliance. */
  showAppliance?: boolean
  /** Heading level for the headline; h3 when the card sits under a section heading. */
  headingAs?: 'h2' | 'h3'
}

/** One alert: severity, plain-language explanation of the evidence, advice, and the acknowledge action. */
export function AlertCard({ alert, showAppliance = true, headingAs = 'h2' }: AlertCardProps) {
  const clock = useClock()
  const { toast } = useToast()
  const acknowledge = useAcknowledgeAlert()
  const explanation = describeAlert(alert)
  const context = alertContext(alert)

  const onAcknowledge = () =>
    acknowledge.mutate(alert.id, {
      onSuccess: () =>
        toast({
          title: 'Alert acknowledged',
          description: `${alert.applianceName} stays on watch. It resolves by itself once it is back to normal.`,
          variant: 'success',
        }),
      onError: (error) =>
        toast({
          title: 'Could not acknowledge',
          description: errorMessage(error),
          variant: 'danger',
        }),
    })

  const now = clock()
  return (
    <Card role="group" className="hp-alert-card" aria-labelledby={`alert-${alert.id}`}>
      <CardHeader>
        <div className="hp-badge-row">
          <SeverityBadge severity={alert.severity} />
          <AlertStatusBadge status={alert.status} />
          <span className="hp-muted hp-small">{KIND_LABELS[alert.kind]}</span>
        </div>
        <CardTitle as={headingAs} id={`alert-${alert.id}`}>
          {explanation.headline}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="hp-stack-3">
          {explanation.facts.length > 0 ? (
            <ul className="hp-plain-list">
              {explanation.facts.map((fact) => (
                <li key={fact}>{fact}</li>
              ))}
            </ul>
          ) : null}
          <p>
            <strong>What to do. </strong>
            {explanation.suggestion}
          </p>
          {context.map((line) => (
            <p key={line} className="hp-callout">
              {line}
            </p>
          ))}
          <p className="hp-muted hp-small">
            {showAppliance ? (
              <>
                <ModuleLink to={`/appliances/${alert.applianceId}`}>
                  {alert.applianceName}
                </ModuleLink>
                {'. '}
              </>
            ) : null}
            Opened {formatRelative(alert.openedAt, now).toLowerCase()}
            {alert.acknowledgedAt
              ? `, acknowledged ${formatRelative(alert.acknowledgedAt, now).toLowerCase()}`
              : ''}
            {alert.resolvedAt
              ? `, resolved ${formatRelative(alert.resolvedAt, now).toLowerCase()}`
              : ''}
            .
          </p>
          <details className="hp-technical">
            <summary>Technical details</summary>
            <p className="hp-small">{alert.message}</p>
            <pre>{JSON.stringify(alert.evidence, null, 2)}</pre>
          </details>
          {alert.status === 'OPEN' ? (
            <div>
              <Button
                variant="secondary"
                size="sm"
                leftIcon={<CheckIcon size={16} />}
                loading={acknowledge.isPending}
                aria-label={`Acknowledge alert for ${alert.applianceName}`}
                onClick={onAcknowledge}
              >
                Acknowledge
              </Button>
            </div>
          ) : null}
        </div>
      </CardContent>
    </Card>
  )
}
