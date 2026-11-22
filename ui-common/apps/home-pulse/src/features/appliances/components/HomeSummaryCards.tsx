import { ActivityIcon, BarList, BentoCard, BigStat, Skeleton } from '@platform/ui'
import { formatWatts, pluralize } from '../../../lib/format'
import { useAllHealth } from '../hooks'
import type { Appliance, HealthStatus } from '../types'
import type { Slot } from './slot'

const MIX: { status: HealthStatus[]; label: string; tone: 'lilac' | 'brass' | 'ink' | 'lime' }[] = [
  { status: ['HEALTHY'], label: 'Healthy', tone: 'lilac' },
  { status: ['WARNING'], label: 'Watch', tone: 'brass' },
  { status: ['CRITICAL'], label: 'Alert', tone: 'ink' },
  { status: ['LEARNING', 'NO_DEVICE'], label: 'Learning or no device', tone: 'lime' },
]

/** How the appliances are doing: the healthy count as a huge figure, and the share in each state as thick bars. */
export function HealthMixCard({
  appliances,
  className,
  style,
}: { appliances: readonly Appliance[] } & Slot) {
  const results = useAllHealth(appliances.map((a) => a.id))
  const statuses = results.map((r) => r.data?.status)
  const loaded = statuses.every(Boolean)
  const total = appliances.length
  const count = (m: (typeof MIX)[number]) =>
    statuses.filter((s) => s && m.status.includes(s)).length
  const healthy = count(MIX[0]!)
  const parts = MIX.map((m) => ({ ...m, n: count(m) })).filter((m) => m.n > 0)
  const mixSummary = parts.map((m) => `${m.n} ${m.label.toLowerCase()}`).join(', ')
  return (
    <BentoCard
      span={5}
      title="How they are doing"
      icon={<ActivityIcon size={18} />}
      className={className}
      {...(style ? { style } : {})}
    >
      {loaded ? (
        <>
          <BigStat
            value={healthy}
            unit={`of ${total} healthy`}
            trend={healthy === total ? 'up' : 'flat'}
            delta={healthy === total ? 'All healthy' : `${total - healthy} to check`}
          />
          <div className="hp-mix" role="img" aria-label={mixSummary}>
            {parts.map((m) => (
              <span
                key={m.label}
                className="hp-mix-part"
                data-tone={m.tone}
                style={{ flexGrow: m.n }}
              />
            ))}
          </div>
          <ul className="hp-mix-legend" aria-label="Appliances by health">
            {parts.map((m) => (
              <li key={m.label} data-tone={m.tone}>
                <span className="hp-mix-dot" aria-hidden="true" />
                {m.label}
                <strong>{m.n}</strong>
              </li>
            ))}
          </ul>
        </>
      ) : (
        <Skeleton height="14rem" />
      )}
    </BentoCard>
  )
}

/** The one lime card: energy used across every appliance in the last day, and which ones used it. */
export function EnergyCard({
  appliances,
  className,
  style,
}: { appliances: readonly Appliance[] } & Slot) {
  const results = useAllHealth(appliances.map((a) => a.id))
  const rows = appliances
    .map((a, i) => ({ name: a.name, last24h: results[i]?.data?.last24h ?? null }))
    .filter((r) => r.last24h)
  const loaded = results.every((r) => r.isSuccess || r.isError)
  const total = rows.reduce((sum, r) => sum + (r.last24h?.energyKwh ?? 0), 0)
  const avg = rows.reduce((sum, r) => sum + (r.last24h?.avgWatts ?? 0), 0)
  return (
    <BentoCard
      span={5}
      tone="lime"
      title="Energy, last 24 hours"
      icon={<ActivityIcon size={18} />}
      className={className}
      {...(style ? { style } : {})}
    >
      {!loaded ? (
        <Skeleton height="10rem" />
      ) : rows.length === 0 ? (
        <p>No readings yet. Connect a device and the energy each appliance uses appears here.</p>
      ) : (
        <>
          <BigStat
            size="md"
            value={Math.round(total * 10) / 10}
            unit="kWh"
            format={{ maximumFractionDigits: 1, minimumFractionDigits: 1 }}
            caption={`${formatWatts(avg)} on average, across ${pluralize(rows.length, 'appliance')}.`}
          />
          <div className="hp-energy-list">
            <BarList
              label="Energy by appliance, last 24 hours"
              tone="ink"
              items={rows.map((r) => ({ label: r.name, value: r.last24h?.energyKwh ?? 0 }))}
              format={(v) => `${v.toFixed(1)} kWh`}
            />
          </div>
        </>
      )}
    </BentoCard>
  )
}
