import {
  Badge,
  BentoCard,
  BentoGrid,
  Button,
  ChartIcon,
  CheckCircleIcon,
  CodeIcon,
  DataTable,
  Donut,
  EmptyState,
  Illustration,
  UsersIcon,
  type ChartTone,
  type DataTableColumn,
  type DonutSegment,
} from '@platform/ui'
import { useWorkspaceSession } from '@platform/workspace-kit'
import { BarList } from '../charts/Bars'
import { fillSeries } from '../charts/geometry'
import { TimeSeriesChart } from '../charts/TimeSeriesChart'
import { ErrorPanel, LoadingBlock, MonoId, Person, Screen } from '../components/common'
import shared from '../components/shared.module.css'
import { UsageStats } from '../components/UsageStats'
import { PERMISSIONS } from '../lib/catalogue'
import { useNames, usePlatformQuery } from '../lib/api'
import { formatCompact, formatInt, formatPercent } from '../lib/format'
import { RANGES, useUsageWindow, type RangeId, type UsageWindow } from '../lib/range'
import type { ServiceUsage, TopUser, UsageSummary } from '../lib/types'
import { YourUsage } from './YourUsage'
import styles from './Usage.module.css'

export function RangeSwitcher({
  value,
  onChange,
}: {
  value: RangeId
  onChange: (id: RangeId) => void
}) {
  return (
    <div role="group" aria-label="Time range" className={styles.switcher}>
      {RANGES.map((r) => (
        <button
          key={r.id}
          type="button"
          className={styles.rangeButton}
          aria-pressed={value === r.id}
          aria-label={`Show the ${r.long}`}
          onClick={() => onChange(r.id)}
        >
          {r.label}
        </button>
      ))}
    </div>
  )
}

export function UsageScreen() {
  const win = useUsageWindow('24h')
  return (
    <Screen
      title="Usage"
      area="Usage analytics"
      permission={PERMISSIONS.usageReadAll}
      description="Every request through the gateway: how much, how fast and how often it fails."
      actions={
        <div className={styles.controls}>
          <RangeSwitcher value={win.range.id} onChange={win.setRange} />
          <Button variant="secondary" size="sm" onClick={win.refresh}>
            Refresh
          </Button>
        </div>
      }
    >
      <UsageBody win={win} />
    </Screen>
  )
}

const STATUS_TONE: Record<string, ChartTone> = {
  '2xx': 'lime',
  '3xx': 'lilac',
  '4xx': 'brass',
  '5xx': 'danger',
}
const STATUS_LABEL: Record<string, string> = {
  '2xx': '2xx Succeeded',
  '3xx': '3xx Redirected',
  '4xx': '4xx Rejected (client errors)',
  '5xx': '5xx Failed (server errors)',
}

function UsageBody({ win }: { win: UsageWindow }) {
  const { can } = useWorkspaceSession()
  const summary = usePlatformQuery<UsageSummary>('/v1/usage/summary', {
    from: win.from,
    to: win.to,
  })
  // The previous window only adds the "vs. before" deltas; if it fails the page simply shows no deltas.
  const previous = usePlatformQuery<UsageSummary>('/v1/usage/summary', {
    from: win.previousFrom,
    to: win.previousTo,
  })

  if (summary.isPending) return <LoadingBlock label="Loading usage" rows={4} />
  if (summary.isError) {
    return (
      <ErrorPanel error={summary.error} subject="usage" onRetry={() => void summary.refetch()} />
    )
  }
  const data = summary.data
  const buckets = fillSeries(data.series, data.resolution, data.from, data.to)
  const unit = data.resolution === '1d' ? 'day' : data.resolution === '1h' ? 'hour' : 'minute'
  const statusSegments: DonutSegment[] = Object.entries(data.byStatusClass)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([cls, value]) => ({
      label: STATUS_LABEL[cls] ?? cls,
      value,
      tone: STATUS_TONE[cls] ?? 'ink',
    }))
  const totalResponses = statusSegments.reduce((sum, seg) => sum + seg.value, 0)
  const serviceColumns: DataTableColumn<ServiceUsage>[] = [
    {
      id: 'service',
      header: 'Service',
      cell: (s) => <strong>{s.service}</strong>,
      sortValue: (s) => s.service,
    },
    {
      id: 'requests',
      header: 'Requests',
      align: 'end',
      sortValue: (s) => s.requests,
      cell: (s) => <span className={shared.num}>{formatInt(s.requests)}</span>,
    },
    {
      id: 'errors',
      header: 'Errors',
      align: 'end',
      sortValue: (s) => s.errors,
      cell: (s) => <span className={shared.num}>{formatInt(s.errors)}</span>,
    },
    {
      id: 'rate',
      header: 'Error rate',
      align: 'end',
      sortValue: (s) => (s.requests ? s.errors / s.requests : 0),
      cell: (s) => (
        <span className={shared.num}>
          {s.requests ? formatPercent(s.errors / s.requests) : 'n/a'}
        </span>
      ),
    },
  ]

  return (
    <div className={shared.stack}>
      <section aria-label="Headline numbers">
        <UsageStats
          summary={data}
          previous={previous.data}
          against={`vs. the previous ${win.range.long.replace('last ', '')}`}
        />
      </section>

      <BentoGrid>
        <BentoCard
          span={12}
          title="Traffic"
          icon={<ChartIcon size={18} />}
          actions={
            <span className={shared.panelHint}>
              One point per {unit}, UTC. {data.resolution} resolution.
            </span>
          }
        >
          {data.totalRequests === 0 ? (
            <EmptyState
              illustration={<Illustration name="empty" />}
              headingAs="h3"
              title={`No requests in the ${win.range.long}`}
              description="Traffic shows up here as soon as someone uses a product through the gateway. Try a longer range."
              action={
                win.range.id !== '30d' ? (
                  <Button variant="secondary" onClick={() => win.setRange('30d')}>
                    Show the last 30 days
                  </Button>
                ) : undefined
              }
            />
          ) : (
            <TimeSeriesChart
              buckets={buckets}
              resolution={data.resolution}
              label={`Requests and errors, ${win.range.long}`}
            />
          )}
        </BentoCard>

        <BentoCard span={7} title="By service" icon={<CodeIcon size={18} />}>
          <DataTable
            dense
            caption="Requests by service"
            columns={serviceColumns}
            data={data.byService}
            getRowId={(s) => s.service}
            defaultSort={{ columnId: 'requests', direction: 'desc' }}
            emptyState={<span className={shared.muted}>No service saw traffic in this range.</span>}
          />
        </BentoCard>

        <BentoCard span={5} title="Responses" icon={<CheckCircleIcon size={18} />}>
          {statusSegments.length === 0 ? (
            <p className={shared.muted}>No responses in this range.</p>
          ) : (
            <Donut
              label="Share of responses by status class"
              segments={statusSegments}
              center={
                <span className={styles.donutCenter}>
                  <strong>{formatCompact(totalResponses)}</strong>
                  <span>responses</span>
                </span>
              }
              format={formatInt}
            />
          )}
        </BentoCard>

        <TopUsers win={win} />
      </BentoGrid>

      {can(PERMISSIONS.usageReadSelf) ? (
        <YourUsage from={win.from} to={win.to} rangeLabel={win.range.long} />
      ) : null}
    </div>
  )
}

function TopUsers({ win }: { win: UsageWindow }) {
  const top = usePlatformQuery<TopUser[]>('/v1/usage/top-users', {
    from: win.from,
    to: win.to,
    limit: 10,
  })
  const names = useNames(
    (top.data ?? []).filter((u) => u.principalType === 'USER').map((u) => u.principalId),
  )

  return (
    <BentoCard
      span={12}
      title="Top users"
      icon={<UsersIcon size={18} />}
      actions={<span className={shared.panelHint}>By requests, {win.range.long}</span>}
    >
      {top.isPending ? (
        <LoadingBlock label="Loading top users" rows={3} />
      ) : top.isError ? (
        <ErrorPanel error={top.error} subject="top users" onRetry={() => void top.refetch()} />
      ) : top.data.length === 0 ? (
        <p className={shared.muted}>Nobody made a request in this range.</p>
      ) : (
        <BarList
          label="Top users by requests"
          items={top.data.map((u) => ({
            id: `${u.principalType}:${u.principalId}`,
            value: u.requests,
            note: u.errors > 0 ? `${formatInt(u.errors)} errors` : undefined,
            label:
              u.principalType === 'USER' ? (
                <Person
                  name={names.nameOf(u.principalId)}
                  to={`/users/${u.principalId}`}
                  size="xs"
                />
              ) : (
                <span className={styles.principal}>
                  <Badge>{u.principalType}</Badge>
                  <MonoId id={u.principalId} />
                </span>
              ),
          }))}
        />
      )}
    </BentoCard>
  )
}
