import { AreaChart, BentoCard, BigStat, Button, CoinsIcon } from '@platform/ui'
import { ModuleLink } from '@platform/workspace-kit'
import { useMemo } from 'react'
import type { Slot } from '../../../components/CardState'
import { formatMinor, formatSigned, minorDigits } from '../../../lib/money'
import { useStatement } from '../../statement/hooks'
import { useHousehold } from '../hooks/useHousehold'

/** How many of the latest postings the balance line covers. */
const HISTORY = 30

export interface BalanceHistory {
  series: number[]
  /** Net change across the postings shown. */
  changeMinor: number
  count: number
}

/** The running balance after each of the latest postings, and what they added up to. */
export function balanceHistory(
  rows: readonly { amountMinor: number; balanceMinor: number }[],
): BalanceHistory {
  const recent = rows.slice(-HISTORY)
  return {
    series: recent.map((r) => r.balanceMinor),
    changeMinor: recent.reduce((sum, r) => sum + r.amountMinor, 0),
    count: recent.length,
  }
}

const trendOf = (minor: number): 'up' | 'down' | 'flat' =>
  minor > 0 ? 'up' : minor < 0 ? 'down' : 'flat'

/**
 * What the dashboard leads with, and its one black card: the shared pool as a huge counting figure, how it has
 * moved, the balance drawn as a line, and the one primary action. A kid sees their own pot here instead.
 *
 * The figure is display only: money everywhere else in the app stays integer minor units. Here the minor amount is
 * divided once by the currency's own power of ten so the number can count up, and it lands on the exact amount.
 */
export function PoolHero({ className, style }: Slot) {
  const { household, pool, myPot, isKid, currency } = useHousehold()
  const account = isKid ? myPot : pool
  const statement = useStatement(household.id, account?.id ?? '', { page: 0, size: 500 })
  const history = useMemo(() => balanceHistory(statement.data?.rows ?? []), [statement.data])
  const threshold = household.approvalThresholdMinor
  const label = isKid ? 'My pot' : 'Shared pool'
  const scale = 10 ** minorDigits(currency)
  const points = history.series.map((value, i) => ({ label: `Entry ${i + 1}`, value }))

  return (
    <BentoCard
      tone="dark"
      span={7}
      title={label}
      icon={<CoinsIcon size={18} />}
      className={className}
      {...(style ? { style } : {})}
      actions={
        <Button asChild size="sm" variant="primary">
          <ModuleLink to={`/h/${household.id}/move`}>
            {isKid ? 'Spend from my pot' : 'Move money'}
          </ModuleLink>
        </Button>
      }
    >
      <div role="group" aria-label={label}>
        {account ? (
          <BigStat
            value={account.balanceMinor / scale}
            locale="en-US"
            format={{ style: 'currency', currency }}
            {...(history.count > 0
              ? {
                  delta: formatSigned(history.changeMinor, currency),
                  trend: trendOf(history.changeMinor),
                  caption: `over the last ${history.count} ${history.count === 1 ? 'entry' : 'entries'}`,
                }
              : { caption: 'Nothing recorded yet' })}
          />
        ) : (
          <p className="ft-muted">Not available</p>
        )}
      </div>
      {points.length > 1 ? (
        <AreaChart
          className="ft-hero-chart"
          label={`${label} balance after each of the last ${history.count} entries`}
          data={points}
          height={150}
          tone="lime"
          showAxis={false}
          gridLines={2}
          format={(v) => formatMinor(Math.round(v), currency)}
        />
      ) : null}
      <p className="ft-hero-note">
        {isKid
          ? 'This is your own pot. Spend from it, or ask for something bigger to be approved.'
          : threshold === null
            ? 'No approval limit: every spend is recorded straight away.'
            : `Spends above ${formatMinor(threshold, currency)} need a second person to approve.`}
      </p>
      {isKid ? null : (
        <div className="ft-quick">
          <ModuleLink to={`/h/${household.id}/move?tab=deposit`}>Deposit</ModuleLink>
          <ModuleLink to={`/h/${household.id}/move?tab=spend`}>Spend</ModuleLink>
          <ModuleLink to={`/h/${household.id}/move?tab=transfer`}>Transfer</ModuleLink>
        </div>
      )}
    </BentoCard>
  )
}
