import {
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  KeyValueList,
  Skeleton,
  Stat,
  type KeyValueItem,
} from '@platform/ui'
import { ModuleLink } from '@platform/workspace-kit'
import type { ReactNode } from 'react'
import { useClock } from '../../../lib/clock'
import { errorMessage } from '../../../lib/errors'
import {
  formatDate,
  formatDaysUntil,
  formatRelative,
  formatWatts,
  pluralize,
} from '../../../lib/format'
import { describeAlert } from '../../alerts/evidence'
import type { AlertDto } from '../../alerts/types'
import { useCurrentDraw, useTrend } from '../../readings/hooks'
import { useHealth } from '../hooks'
import { TYPE_LABELS, type Appliance, type ApplianceHealth } from '../types'
import { HealthStatusBadge } from './HealthStatusBadge'

/** "Kitchen fridge draws 14% more power." becomes "Draws 14% more power." so the card does not repeat its own title. */
function withoutName(headline: string, name: string): string {
  if (!headline.startsWith(`${name} `)) return headline
  const rest = headline.slice(name.length + 1)
  return rest.charAt(0).toUpperCase() + rest.slice(1)
}

/** One plain sentence on what is going on with this appliance. */
export function statusLine(health: ApplianceHealth, alerts: readonly AlertDto[]): string {
  switch (health.status) {
    case 'NO_DEVICE':
      return 'No device yet. Register a smart plug to start learning its normal.'
    case 'LEARNING':
      return 'Learning what normal looks like. Alerts start after about a week of readings.'
    case 'HEALTHY':
      return 'Running normally.'
    case 'WARNING':
    case 'CRITICAL': {
      const lead = alerts.find((a) => a.status === 'OPEN') ?? alerts[0]
      return lead
        ? withoutName(describeAlert(lead).headline, health.name)
        : 'Something has drifted from normal.'
    }
  }
}

/** Warranty and service in one line each: the dates a person acts on. */
export function dateFacts(service: ApplianceHealth['service'] | Appliance): KeyValueItem[] {
  const items: KeyValueItem[] = []
  if (service.warrantyEndDate) {
    items.push({
      id: 'warranty',
      label: 'Warranty',
      value: service.underWarranty
        ? `Ends ${formatDate(service.warrantyEndDate)}${service.daysToWarrantyEnd !== null ? ` (${formatDaysUntil(service.daysToWarrantyEnd)})` : ''}`
        : `Ended ${formatDate(service.warrantyEndDate)}`,
    })
  }
  if (service.nextServiceDate) {
    items.push({
      id: 'service',
      label: 'Next service',
      value: service.serviceOverdue
        ? `${formatDate(service.nextServiceDate)} (overdue)`
        : formatDate(service.nextServiceDate),
    })
  }
  return items
}

/** One appliance on the home: status in a sentence, current draw with its 24-hour shape, and the dates that matter. */
export function ApplianceCard({ appliance }: { appliance: Appliance }) {
  const clock = useClock()
  const health = useHealth(appliance.id)
  const hasDevice = health.data ? health.data.status !== 'NO_DEVICE' : false
  const draw = useCurrentDraw(appliance.id, hasDevice)
  const trend = useTrend(appliance.id, hasDevice)

  const open = health.data?.activeAlerts.filter((a) => a.status === 'OPEN').length ?? 0
  const acknowledged =
    health.data?.activeAlerts.filter((a) => a.status === 'ACKNOWLEDGED').length ?? 0

  let currentDraw: ReactNode = <Skeleton width="4rem" height="1.5rem" />
  if (health.data && !hasDevice) currentDraw = <span className="hp-stat-note">No device</span>
  else if (draw.data) currentDraw = formatWatts(draw.data.watts)
  else if (draw.isSuccess) currentDraw = <span className="hp-stat-note">No recent reading</span>
  else if (draw.isError) currentDraw = <span className="hp-stat-note">Unavailable</span>

  const facts: KeyValueItem[] = [
    {
      id: 'seen',
      label: 'Last seen',
      value: health.data ? (
        hasDevice ? (
          formatRelative(health.data.lastReadingAt, clock())
        ) : (
          <span className="hp-muted">Never</span>
        )
      ) : (
        <Skeleton width="5rem" height="1rem" />
      ),
    },
    {
      id: 'alerts',
      label: 'Open alerts',
      value: health.data ? (
        <>
          <strong>{open}</strong>
          {acknowledged > 0 ? (
            <span className="hp-muted hp-small"> (+{pluralize(acknowledged, 'acknowledged')})</span>
          ) : null}
        </>
      ) : (
        <Skeleton width="2rem" height="1rem" />
      ),
    },
    ...dateFacts(health.data?.service ?? appliance),
  ]

  return (
    <Card
      interactive
      className="hp-appliance-card"
      {...(health.data ? { 'data-status': health.data.status } : {})}
    >
      <CardHeader>
        <div className="hp-card-title-row">
          <CardTitle as="h2">
            <ModuleLink to={`/appliances/${appliance.id}`} className="hp-stretched-link">
              {appliance.name}
            </ModuleLink>
          </CardTitle>
          {health.data ? <HealthStatusBadge status={health.data.status} /> : null}
        </div>
        <p className="hp-muted hp-small">
          {TYPE_LABELS[appliance.type]}
          {appliance.location ? `, ${appliance.location}` : ''}
        </p>
      </CardHeader>
      <CardContent>
        {health.isError ? (
          <div className="hp-stack-2">
            <p className="hp-small">{errorMessage(health.error)}</p>
            <Button
              size="sm"
              variant="secondary"
              className="hp-above-link"
              onClick={() => void health.refetch()}
            >
              Retry
            </Button>
          </div>
        ) : (
          <div className="hp-stack-3">
            <p className="hp-card-status">
              {health.data ? (
                statusLine(health.data, health.data.activeAlerts)
              ) : (
                <Skeleton width="80%" height="1rem" />
              )}
            </p>
            <Stat
              className="hp-card-stat"
              label="Current draw"
              value={currentDraw}
              {...(trend.data && trend.data.length > 1
                ? {
                    sparkline: trend.data,
                    sparklineLabel: 'Average draw per hour, last 24 hours',
                    sparklineTone: (health.data?.status === 'CRITICAL'
                      ? 'danger'
                      : health.data?.status === 'WARNING'
                        ? 'brass'
                        : 'accent') as 'danger' | 'brass' | 'accent',
                  }
                : {})}
            />
            <KeyValueList dense divided={false} items={facts} className="hp-card-facts" />
          </div>
        )}
      </CardContent>
    </Card>
  )
}
