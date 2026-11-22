import {
  AreaChart,
  BentoCard,
  BigStat,
  Button,
  cx,
  KeyValueList,
  Skeleton,
  type ChartTone,
  type KeyValueItem,
} from '@platform/ui'
import { ModuleLink } from '@platform/workspace-kit'
import { useMemo, type ReactNode } from 'react'
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
import { SimulatedBadge } from '../../simulation/SimulationControls'
import { HealthStatusBadge } from './HealthStatusBadge'
import type { Slot } from './slot'

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

const TREND_TONE: Partial<Record<ApplianceHealth['status'], ChartTone>> = {
  CRITICAL: 'danger',
  WARNING: 'brass',
}

/**
 * One appliance as a bento card: a huge live wattage, its 24-hour shape drawn as a smooth area, the status as a pill and
 * the dates that matter underneath. The whole card is the link.
 */
export function ApplianceCard({
  appliance,
  span = 4,
  className,
  style,
}: { appliance: Appliance; span?: number } & Slot) {
  const clock = useClock()
  const health = useHealth(appliance.id)
  const hasDevice = health.data ? health.data.status !== 'NO_DEVICE' : false
  const draw = useCurrentDraw(appliance.id, hasDevice)
  const trend = useTrend(appliance.id, hasDevice)

  const open = health.data?.activeAlerts.filter((a) => a.status === 'OPEN').length ?? 0
  const acknowledged =
    health.data?.activeAlerts.filter((a) => a.status === 'ACKNOWLEDGED').length ?? 0

  const points = useMemo(
    () => (trend.data ?? []).map((watts, i) => ({ label: `${i}`, value: watts })),
    [trend.data],
  )

  let currentDraw: ReactNode = <Skeleton width="6rem" height="2.5rem" />
  if (health.data && !hasDevice) currentDraw = <span className="hp-stat-note">No device</span>
  else if (draw.data)
    currentDraw = (
      <BigStat
        size="md"
        value={
          draw.data.watts < 10 ? Math.round(draw.data.watts * 10) / 10 : Math.round(draw.data.watts)
        }
        unit="W"
        format={{ maximumFractionDigits: draw.data.watts < 10 ? 1 : 0 }}
      />
    )
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
    <BentoCard
      span={span}
      className={cx('hp-appliance-card', className)}
      {...(style ? { style } : {})}
      {...(health.data ? { 'data-status': health.data.status } : {})}
      title={
        <ModuleLink to={`/appliances/${appliance.id}`} className="hp-stretched-link">
          {appliance.name}
        </ModuleLink>
      }
      actions={
        health.data ? (
          <span className="hp-inline-meta">
            {health.data.simulated ? <SimulatedBadge /> : null}
            <HealthStatusBadge status={health.data.status} />
          </span>
        ) : null
      }
    >
      <p className="hp-muted hp-small hp-card-sub">
        {TYPE_LABELS[appliance.type]}
        {appliance.location ? `, ${appliance.location}` : ''}
      </p>
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
          <div className="hp-draw">
            <span className="hp-draw-label">Current draw</span>
            <div className="hp-draw-value">{currentDraw}</div>
            {points.length > 1 ? (
              <AreaChart
                className="hp-draw-chart"
                label="Average draw per hour, last 24 hours"
                data={points}
                height={84}
                gridLines={1}
                showAxis={false}
                tone={TREND_TONE[health.data?.status ?? 'HEALTHY'] ?? 'ink'}
                format={(v) => formatWatts(v)}
              />
            ) : null}
          </div>
          <KeyValueList dense divided={false} items={facts} className="hp-card-facts" />
        </div>
      )}
    </BentoCard>
  )
}
