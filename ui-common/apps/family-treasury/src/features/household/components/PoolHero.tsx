import { Button, Sparkline, Stat, VaultRings, type StatTrend } from '@platform/ui'
import { ModuleLink } from '@platform/workspace-kit'
import { MoneyText } from '../../../components/MoneyText'
import { formatMinor, formatSigned } from '../../../lib/money'
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

const trendOf = (minor: number): StatTrend => (minor > 0 ? 'up' : minor < 0 ? 'down' : 'flat')

/**
 * What the dashboard leads with: the shared pool as one large figure on the vault surface, how it has moved, and
 * the one primary action. A kid sees their own pot here instead (they have no pool).
 */
export function PoolHero() {
  const { household, pool, myPot, isKid, currency } = useHousehold()
  const account = isKid ? myPot : pool
  const statement = useStatement(household.id, account?.id ?? '', { page: 0, size: 500 })
  const history = balanceHistory(statement.data?.rows ?? [])
  const threshold = household.approvalThresholdMinor
  const label = isKid ? 'My pot' : 'Shared pool'

  return (
    <section
      className="ft-hero pp-grain"
      data-surface="vault"
      aria-label={isKid ? 'My pot' : `${household.name}: the shared pool`}
    >
      <VaultRings className="ft-hero-rings" />
      <div className="ft-hero-body">
        <Stat
          className="ft-hero-stat"
          label={label}
          value={
            account ? (
              <MoneyText minor={account.balanceMinor} currency={currency} />
            ) : (
              'Not available'
            )
          }
          {...(history.count > 0
            ? {
                delta: formatSigned(history.changeMinor, currency),
                trend: trendOf(history.changeMinor),
                hint: `over the last ${history.count} ${history.count === 1 ? 'entry' : 'entries'}`,
              }
            : { hint: 'Nothing recorded yet' })}
        />
        {history.series.length > 1 ? (
          <Sparkline
            className="ft-hero-line"
            data={history.series}
            width={320}
            height={64}
            animate
            label={`${label} balance after each of the last ${history.count} entries`}
          />
        ) : null}
        <p className="ft-hero-note">
          {isKid
            ? 'This is your own pot. Spend from it, or ask for something bigger to be approved.'
            : threshold === null
              ? 'No approval limit: every spend is recorded straight away.'
              : `Spends above ${formatMinor(threshold, currency)} need a second person to approve.`}
        </p>
      </div>
      <div className="ft-hero-actions">
        <Button asChild size="lg">
          <ModuleLink to={`/h/${household.id}/move`}>
            {isKid ? 'Spend from my pot' : 'Move money'}
          </ModuleLink>
        </Button>
        {isKid ? null : (
          <div className="ft-quick">
            <ModuleLink to={`/h/${household.id}/move?tab=deposit`}>Deposit</ModuleLink>
            <ModuleLink to={`/h/${household.id}/move?tab=spend`}>Spend</ModuleLink>
            <ModuleLink to={`/h/${household.id}/move?tab=transfer`}>Transfer</ModuleLink>
          </div>
        )}
      </div>
    </section>
  )
}
