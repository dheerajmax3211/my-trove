import {
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  EmptyState,
  PageHeader,
} from '@platform/ui'
import { Link } from 'react-router-dom'
import { LoadingBlock, QueryState } from '../../../components/QueryState'
import { MoneyText } from '../../../components/MoneyText'
import { StatCard } from '../../../components/StatCard'
import { formatCalendarDate } from '../../../lib/dates'
import { formatMinor } from '../../../lib/money'
import { PENDING, useApprovals } from '../../approvals/hooks'
import { useSchedules } from '../../allowances/hooks'
import { useEntries } from '../../money/hooks'
import { useStatement } from '../../statement/hooks'
import { RecentEntries, RecentStatementRows } from '../components/RecentActivity'
import { useHousehold } from '../hooks/useHousehold'
import { RoleBadge } from '../../../components/RoleBadge'

function UpcomingAllowances() {
  const { household, accountName, currency } = useHousehold()
  const schedules = useSchedules(household.id)
  return (
    <Card>
      <CardHeader>
        <CardTitle as="h2">Upcoming allowances</CardTitle>
      </CardHeader>
      <CardContent>
        <QueryState
          query={schedules}
          loading={<LoadingBlock label="Loading allowances" rows={2} />}
        >
          {(list) => {
            const active = list
              .filter((s) => s.active)
              .sort((a, b) => a.nextDueOn.localeCompare(b.nextDueOn))
            if (active.length === 0) {
              return (
                <EmptyState
                  headingAs="h3"
                  title="No allowances scheduled"
                  description="Set up a weekly or monthly allowance for a kid."
                  action={<Link to={`/h/${household.id}/allowances`}>Go to allowances</Link>}
                />
              )
            }
            return (
              <ul className="ft-feed">
                {active.slice(0, 3).map((s) => (
                  <li key={s.id}>
                    <div>
                      <strong>{accountName(s.toAccountId)}</strong>
                      <span className="ft-muted">
                        {s.frequency === 'WEEKLY' ? 'Weekly' : 'Monthly'}, next on{' '}
                        {formatCalendarDate(s.nextDueOn)}
                      </span>
                    </div>
                    <MoneyText minor={s.amountMinor} currency={currency} />
                  </li>
                ))}
              </ul>
            )
          }}
        </QueryState>
      </CardContent>
    </Card>
  )
}

function KidDashboard() {
  const { household, myPot, currency, me } = useHousehold()
  const approvals = useApprovals(household.id, PENDING)
  const statement = useStatement(household.id, myPot?.id ?? '', { page: 0, size: 5 })
  const pendingCount = approvals.data?.length
  return (
    <>
      <PageHeader
        title={`Hi ${me.displayName ?? 'there'}`}
        description="This is your own pot. You can spend from it and ask for bigger things to be approved."
        actions={
          <Button asChild>
            <Link to={`/h/${household.id}/move`}>Spend from my pot</Link>
          </Button>
        }
      />
      <div className="ft-grid">
        <StatCard
          label="My pot"
          value={
            myPot ? <MoneyText minor={myPot.balanceMinor} currency={currency} /> : 'No pot yet'
          }
        />
        <StatCard
          label="Requests waiting"
          value={pendingCount ?? '...'}
          hint={<Link to={`/h/${household.id}/approvals`}>See my requests</Link>}
        />
      </div>
      <QueryState query={statement} loading={<LoadingBlock label="Loading activity" />}>
        {(s) => <RecentStatementRows rows={s.rows} currency={currency} />}
      </QueryState>
    </>
  )
}

function FullDashboard() {
  const { household, pool, pots, currency, trusted, role, memberName } = useHousehold()
  const ownerRole = (uid: string | null) => household.members.find((m) => m.uid === uid)?.role
  const approvals = useApprovals(household.id, PENDING)
  const entries = useEntries(household.id, 0, 5)
  const base = `/h/${household.id}`
  const threshold = household.approvalThresholdMinor

  return (
    <>
      <PageHeader
        eyebrow={<RoleBadge role={role} />}
        title={household.name}
        description={
          threshold === null
            ? 'No approval limit: every spend is recorded straight away.'
            : `Spends above ${formatMinor(threshold, currency)} need a second person to approve.`
        }
        actions={
          <>
            <Button asChild>
              <Link to={`${base}/move?tab=deposit`}>Deposit</Link>
            </Button>
            <Button asChild variant="secondary">
              <Link to={`${base}/move?tab=spend`}>Spend</Link>
            </Button>
            <Button asChild variant="secondary">
              <Link to={`${base}/move?tab=transfer`}>Transfer</Link>
            </Button>
          </>
        }
      />
      <div className="ft-grid">
        <StatCard
          label="Shared pool"
          value={
            pool ? <MoneyText minor={pool.balanceMinor} currency={currency} /> : 'Not available'
          }
          hint="Money the household holds together"
        />
        <StatCard
          label="Pending approvals"
          value={approvals.isPending ? '...' : (approvals.data?.length ?? 0)}
          hint={
            <Link to={`${base}/approvals`}>{trusted ? 'Review requests' : 'See requests'}</Link>
          }
        />
      </div>

      <section aria-labelledby="pots-heading" className="ft-section">
        <h2 id="pots-heading" className="ft-h2">
          Member pots
        </h2>
        {pots.length === 0 ? (
          <EmptyState title="No member pots" description="Add a member to give them a pot." />
        ) : (
          <ul className="ft-grid ft-plain-list">
            {pots.map((p) => (
              <li key={p.id}>
                <Card>
                  <CardContent>
                    <p className="ft-stat-label">
                      {p.ownerUid ? memberName(p.ownerUid) : p.name}{' '}
                      {ownerRole(p.ownerUid) ? <RoleBadge role={ownerRole(p.ownerUid)!} /> : null}
                    </p>
                    <p className="ft-stat-value">
                      <MoneyText minor={p.balanceMinor} currency={currency} />
                    </p>
                    <Link to={`${base}/statement?account=${p.id}`}>Statement</Link>
                  </CardContent>
                </Card>
              </li>
            ))}
          </ul>
        )}
      </section>

      <div className="ft-two-col">
        <QueryState query={entries} loading={<LoadingBlock label="Loading activity" />}>
          {(list) => <RecentEntries entries={list} />}
        </QueryState>
        {trusted ? <UpcomingAllowances /> : null}
      </div>
    </>
  )
}

export function DashboardPage() {
  const { isKid } = useHousehold()
  return isKid ? <KidDashboard /> : <FullDashboard />
}
