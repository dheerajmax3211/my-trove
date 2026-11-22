import { BellIcon, BentoCard, BentoGrid, BigStat, DotMatrix, ShieldIcon } from '@platform/ui'
import { useMemo } from 'react'
import { useClock } from '../../../lib/clock'
import { pluralize } from '../../../lib/format'
import { useAlerts } from '../hooks'

const DAY = 24 * 60 * 60_000
const WEEKDAY = new Intl.DateTimeFormat('en', { weekday: 'short' })

/** Two cards over the alert list: how many need you now (the black card) and how many were raised each day this week. */
export function AlertsSummary() {
  const clock = useClock()
  const all = useAlerts('ALL')
  const now = clock()
  const data = all.data

  const summary = useMemo(() => {
    const list = data ?? []
    const open = list.filter((a) => a.status === 'OPEN').length
    const watching = list.filter((a) => a.status === 'ACKNOWLEDGED').length
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime()
    const columns = Array.from({ length: 7 }, (_, i) => {
      const from = startOfToday - (6 - i) * DAY
      const value = list.filter((a) => {
        const t = new Date(a.openedAt).getTime()
        return t >= from && t < from + DAY
      }).length
      return { label: WEEKDAY.format(new Date(from)), value: Math.min(value, 8) }
    })
    return { open, watching, columns }
  }, [data, now])

  if (!data) return null
  return (
    <BentoGrid className="hp-alerts-summary">
      <BentoCard span={5} tone="dark" title="Needs you now" icon={<BellIcon size={18} />}>
        <BigStat
          value={summary.open}
          unit={summary.open === 1 ? 'open alert' : 'open alerts'}
          trend={summary.open === 0 ? 'up' : 'down'}
          delta={summary.open === 0 ? 'All clear' : 'Review below'}
          caption={`${pluralize(summary.watching, 'alert')} acknowledged and still on watch.`}
        />
      </BentoCard>
      <BentoCard span={7} title="Raised this week" icon={<ShieldIcon size={18} />}>
        <DotMatrix
          label="Alerts raised per day, last 7 days"
          columns={summary.columns}
          highlight={6}
        />
      </BentoCard>
    </BentoGrid>
  )
}
