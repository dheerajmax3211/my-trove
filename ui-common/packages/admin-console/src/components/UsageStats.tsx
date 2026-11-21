import { Stat, type StatTrend } from '@platform/ui'
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

/** The four headline numbers. Errors and latency use `goodDirection="down"`: a rise is bad news. */
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
    <div className={styles.row}>
      <Stat
        label="Requests"
        value={formatInt(summary.totalRequests)}
        {...(requests ? { delta: requests.text, trend: requests.trend } : {})}
        {...(requests && against ? { hint: against } : {})}
        sparkline={buckets.map((b) => b.requests)}
        sparklineLabel="Requests over the range"
      />
      <Stat
        label="Error rate"
        value={formatPercent(summary.errorRate)}
        goodDirection="down"
        {...(errors ? { delta: errors.text, trend: errors.trend } : {})}
        hint={errors && against ? against : 'Server errors (5xx) only'}
      />
      <Stat
        label="Latency, p95"
        value={formatMs(summary.p95Ms)}
        goodDirection="down"
        {...(latency ? { delta: latency.text, trend: latency.trend } : {})}
        hint={`Median ${formatMs(summary.p50Ms)}`}
      />
      {showActiveUsers ? (
        <Stat
          label="Active users"
          value={formatInt(summary.activeUsers)}
          {...(users ? { delta: users.text, trend: users.trend } : {})}
          hint={users && against ? against : 'People with at least one request'}
        />
      ) : null}
    </div>
  )
}
