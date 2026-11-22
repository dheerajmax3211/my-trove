import { BentoCard, BigStat, Button, ChartIcon, HeartIcon } from '@platform/ui'
import {
  formatDate,
  formatDuration,
  formatKwh,
  formatPercent,
  formatWatts,
} from '../../../lib/format'
import type { ApplianceHealth } from '../types'
import { HealthStatusBadge } from './HealthStatusBadge'
import type { Slot } from './slot'

const STATUS_COPY: Record<ApplianceHealth['status'], string> = {
  HEALTHY: 'Its power draw matches what we learned as normal.',
  WARNING: 'Something has drifted from normal. Read the alerts below.',
  CRITICAL: 'Something is well outside normal. Read the alerts below.',
  LEARNING:
    'We are learning what normal looks like for this appliance. This takes about a week of readings, and alerts start after that.',
  NO_DEVICE: 'No device is connected, so there is nothing to learn from yet.',
}

/** `+14%`, `-3%`, or null when there is nothing sensible to compare. */
export function changePct(normal: number, now: number | null): string | null {
  if (now === null || normal === 0) return null
  const change = ((now - normal) / normal) * 100
  const rounded = Math.round(change)
  return `${rounded > 0 ? '+' : ''}${rounded}%`
}

export interface HealthSummaryProps extends Slot {
  health: ApplianceHealth
  onRelearn: () => void
}

function baselineRows(baseline: ApplianceHealth['baseline'], last24h: ApplianceHealth['last24h']) {
  return baseline
    ? [
        {
          measure: 'Peak draw',
          normal: formatWatts(baseline.peakWatts),
          now: last24h ? formatWatts(last24h.maxWatts) : null,
          change: last24h ? changePct(baseline.peakWatts, last24h.maxWatts) : null,
        },
        ...(baseline.switching
          ? [
              {
                measure: 'Duty cycle (time running)',
                normal: formatPercent(baseline.dutyMedian * 100),
                now: last24h?.dutyPct != null ? formatPercent(last24h.dutyPct) : null,
                change:
                  last24h?.dutyPct != null
                    ? changePct(baseline.dutyMedian * 100, last24h.dutyPct)
                    : null,
              },
              {
                measure: 'Typical run length',
                normal: formatDuration(baseline.cycleMinutesMedian),
                now: null,
                change: null,
              },
            ]
          : []),
        {
          measure: 'Standby draw',
          normal: formatWatts(baseline.standbyWatts),
          now: null,
          change: null,
        },
      ]
    : []
}

/** Learned baseline against the last 24 hours, with the numbers a person can act on. */
export function BaselineCard({ health, className, style }: { health: ApplianceHealth } & Slot) {
  const { baseline, last24h } = health
  const rows = baselineRows(baseline, last24h)
  if (!baseline) return null
  return (
    <BentoCard
      span={7}
      title="Normal compared with now"
      icon={<ChartIcon size={18} />}
      {...(className ? { className } : {})}
      {...(style ? { style } : {})}
    >
      <div className="hp-stack-4">
        {baseline ? (
          <table className="hp-compare-table">
            <caption>Baseline compared with the last 24 hours</caption>
            <thead>
              <tr>
                <th scope="col">Measure</th>
                <th scope="col">Normal</th>
                <th scope="col">Last 24 h</th>
                <th scope="col">Change</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.measure}>
                  <th scope="row">{row.measure}</th>
                  <td>{row.normal}</td>
                  <td>{row.now ?? <span className="hp-muted">Not measured</span>}</td>
                  <td>{row.change ?? <span className="hp-muted">-</span>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : null}
        {baseline ? (
          <p className="hp-muted hp-small">
            Learned from {baseline.windowsUsed} six-hour windows ending{' '}
            {formatDate(baseline.learnedTo.slice(0, 10))}. Normal is the middle value, so the odd
            door-open or power cut does not skew it.
          </p>
        ) : null}
      </div>
    </BentoCard>
  )
}

export function HealthSummary({ health, onRelearn, className, style }: HealthSummaryProps) {
  const { last24h } = health

  return (
    <BentoCard
      tone="dark"
      span={4}
      title="Health"
      icon={<HeartIcon size={18} />}
      actions={<HealthStatusBadge status={health.status} />}
      {...(className ? { className } : {})}
      {...(style ? { style } : {})}
    >
      <div className="hp-stack-4">
        {last24h ? (
          <BigStat
            value={Math.round(last24h.avgWatts)}
            unit="W"
            caption="Average draw, 24 h"
            secondary={[
              { label: 'Energy, 24 h', value: formatKwh(last24h.energyKwh) },
              {
                label: 'Data received',
                value: formatPercent((last24h.minutesWithData / 1440) * 100),
              },
            ]}
          />
        ) : null}
        <p className="hp-health-note" role="note">
          {STATUS_COPY[health.status]}
        </p>
        {health.baselineStatus !== 'NONE' ? (
          <div>
            <Button variant="secondary" size="sm" onClick={onRelearn}>
              Relearn baseline
            </Button>
            <p className="hp-muted hp-small hp-hint">
              Use this after a repair or service, when the appliance has a new normal.
            </p>
          </div>
        ) : null}
      </div>
    </BentoCard>
  )
}
