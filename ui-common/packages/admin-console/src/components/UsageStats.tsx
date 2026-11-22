import {
  ActivityIcon,
  AlertIcon,
  BigStat,
  ClockIcon,
  Sparkline,
  UsersIcon,
  type StatTrend,
} from '@platform/ui'
import type { ReactNode } from 'react'
import { fillSeries } from '../charts/geometry'
import { formatInt, formatMs, formatPercent } from '../lib/format'
import type { UsageSummary } from '../lib/types'
import styles from './UsageStats.module.css'

interface Change {
  trend: StatTrend
  text: string
}

/** Relative change against the previous window ("+12%"); nothing when there is no baseline to compare to. */
export function relativeChange(
  current: number,
  previous: number | null | undefined,
): Change | undefined {
  if (previous === null || previous === undefined || !Number.isFinite(previous) || previous <= 0)
    return undefined
  const ratio = (current - previous) / previous
  if (Math.abs(ratio) < 0.005) return { trend: 'flat', text: 'no change' }
  const pct = Math.abs(ratio) * 100
  const text = `${ratio > 0 ? '+' : '-'}${pct >= 10 ? Math.round(pct) : pct.toFixed(1)}%`
  return { trend: ratio > 0 ? 'up' : 'down', text }
}

/** Change in a rate, in percentage points ("+0.20 pts"). */
export function pointChange(
  current: number,
  previous: number | null | undefined,
): Change | undefined {
  if (previous === null || previous === undefined || !Number.isFinite(previous)) return undefined
  const diff = (current - previous) * 100
  if (Math.abs(diff) < 0.005) return { trend: 'flat', text: 'no change' }
  return {
    trend: diff > 0 ? 'up' : 'down',
    text: `${diff > 0 ? '+' : '-'}${Math.abs(diff).toFixed(2)} pts`,
  }
}

export interface UsageStatsProps {
  summary: UsageSummary
  previous?: UsageSummary | undefined
  /** Phrase for the comparison, e.g. "vs. the previous 24 hours". */
  against?: string
  /** Hide the active-users figure (the personal view has exactly one user). */
  showActiveUsers?: boolean
}

function Tile({
  label,
  icon,
  dark,
  children,
}: {
  label: string
  icon: ReactNode
  dark?: boolean
  children: ReactNode
}) {
  return (
    <div
      role="group"
      aria-label={label}
      className={`${styles.tile} ${dark ? styles.dark : ''}`}
      {...(dark ? { 'data-surface': 'vault' } : {})}
    >
      <p className={styles.tileHead}>
        <span className={styles.chip} aria-hidden="true">
          {icon}
        </span>
        {label}
      </p>
      {children}
    </div>
  )
}

/** The lime pill follows "better": for errors and latency a fall is good. The sign in the text says which way it moved. */
const pillTrend = (trend: StatTrend, good: 'up' | 'down'): 'up' | 'down' =>
  trend === 'flat' || trend === good ? 'up' : 'down'

/** The four headline numbers, one card each; the first is the page's one black card. */
export function UsageStats({
  summary,
  previous,
  against,
  showActiveUsers = true,
}: UsageStatsProps) {
  const buckets = fillSeries(summary.series, summary.resolution, summary.from, summary.to)
  const requests = relativeChange(summary.totalRequests, previous?.totalRequests)
  const errors = pointChange(summary.errorRate, previous?.errorRate)
  const latency =
    summary.p95Ms !== null ? relativeChange(summary.p95Ms, previous?.p95Ms) : undefined
  const users = relativeChange(summary.activeUsers, previous?.activeUsers)

  return (
    <div className={styles.row} data-count={showActiveUsers ? 4 : 3}>
      <Tile label="Requests" icon={<ActivityIcon size={18} />} dark>
        <BigStat
          size="md"
          value={formatInt(summary.totalRequests)}
          {...(requests ? { delta: requests.text, trend: pillTrend(requests.trend, 'up') } : {})}
          caption={requests && against ? against : 'Everything through the gateway'}
        />
        {buckets.length > 1 ? (
          <Sparkline
            data={buckets.map((b) => b.requests)}
            label="Requests over the range"
            tone="accent"
            height={48}
            className={styles.spark}
          />
        ) : null}
      </Tile>
      <Tile label="Error rate" icon={<AlertIcon size={18} />}>
        <BigStat
          size="md"
          value={formatPercent(summary.errorRate)}
          {...(errors ? { delta: errors.text, trend: pillTrend(errors.trend, 'down') } : {})}
          caption={errors && against ? against : 'Server errors (5xx) only'}
        />
      </Tile>
      <Tile label="Latency, p95" icon={<ClockIcon size={18} />}>
        <BigStat
          size="md"
          value={formatMs(summary.p95Ms)}
          {...(latency ? { delta: latency.text, trend: pillTrend(latency.trend, 'down') } : {})}
          caption={`Median ${formatMs(summary.p50Ms)}`}
        />
      </Tile>
      {showActiveUsers ? (
        <Tile label="Active users" icon={<UsersIcon size={18} />}>
          <BigStat
            size="md"
            value={formatInt(summary.activeUsers)}
            {...(users ? { delta: users.text, trend: pillTrend(users.trend, 'up') } : {})}
            caption={users && against ? against : 'People with at least one request'}
          />
        </Tile>
      ) : null}
    </div>
  )
}
