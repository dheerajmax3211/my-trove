import { Avatar, Badge, Button, EmptyState, Illustration, PageHeader } from '@platform/ui'
import { ModuleLink } from '@platform/workspace-kit'
import { LoadingBlock, QueryState } from '../../../components/QueryState'
import { MoneyText } from '../../../components/MoneyText'
import { RoleBadge } from '../../../components/RoleBadge'
import { formatCalendarDate } from '../../../lib/dates'
import { formatMinor } from '../../../lib/money'
import { ApprovalCard } from '../../approvals/components/ApprovalCard'
import { PENDING, useApprovals } from '../../approvals/hooks'
import { useSchedules } from '../../allowances/hooks'
import { useEntries } from '../../money/hooks'
import { useStatement } from '../../statement/hooks'
import { PoolHero } from '../components/PoolHero'
import { PotTiles } from '../components/PotTiles'
import { RecentEntries, RecentStatementRows } from '../components/RecentActivity'
import { useHousehold } from '../hooks/useHousehold'

const SHOWN = 3

/**
 * Requests waiting for a second person. Unmissable when there are some (the cards are the real ones, so a person who
 * may decide can do it right here), and a calm one-liner when there are none.
 */
function ApprovalsPanel() {
  const { household, isKid, trusted, currency } = useHousehold()
  const approvals = useApprovals(household.id, PENDING)
  const threshold = household.approvalThresholdMinor
  const title = isKid ? 'My requests' : 'Waiting for approval'
  return (
    <QueryState
      query={approvals}
      loading={<LoadingBlock label="Loading requests" rows={2} />}
      errorTitle="We could not load the requests"
    >
      {(list) =>
        list.length === 0 ? (
          <section aria-labelledby="approvals-heading" className="ft-panel ft-calm">
            <h2 id="approvals-heading" className="ft-h2">
              {title}
            </h2>
            <p className="ft-muted">
              {threshold === null
                ? 'This household sets no limit on spends, so nothing waits for a decision.'
                : `Nothing is waiting. A spend above ${formatMinor(threshold, currency)} will appear here for a second person to decide.`}{' '}
              <ModuleLink to={`/h/${household.id}/approvals`}>See past requests</ModuleLink>
            </p>
          </section>
        ) : (
          <section aria-labelledby="approvals-heading" className="ft-attention">
            <div className="ft-attention-head">
              <h2 id="approvals-heading" className="ft-h2">
                {title}
              </h2>
              <Badge variant="warning" dot>
                {list.length} {list.length === 1 ? 'request' : 'requests'}
              </Badge>
            </div>
            <p className="ft-muted">
              {trusted
                ? 'These spends are above the household limit. Nothing is recorded until another owner or approver decides.'
                : 'Bigger spends wait for an owner or approver. You will see the outcome here.'}
            </p>
            <ul className="ft-stack ft-plain-list">
              {list.slice(0, SHOWN).map((a) => (
                <li key={a.id}>
                  <ApprovalCard approval={a} />
                </li>
              ))}
            </ul>
            {list.length > SHOWN ? (
              <p>
                <ModuleLink to={`/h/${household.id}/approvals`}>
                  See all {list.length} requests
                </ModuleLink>
              </p>
            ) : null}
          </section>
        )
      }
    </QueryState>
  )
}

function UpcomingAllowances() {
  const { household, accountName, currency, memberName, pots } = useHousehold()
  const schedules = useSchedules(household.id)
  const ownerOf = (accountId: string) => pots.find((p) => p.id === accountId)?.ownerUid ?? null
  return (
    <section aria-labelledby="allowances-heading" className="ft-panel">
      <h2 id="allowances-heading" className="ft-h2">
        Upcoming allowances
      </h2>
      <QueryState query={schedules} loading={<LoadingBlock label="Loading allowances" rows={2} />}>
        {(list) => {
          const active = list
            .filter((s) => s.active)
            .sort((a, b) => a.nextDueOn.localeCompare(b.nextDueOn))
          if (active.length === 0) {
            return (
              <EmptyState
                illustration={<Illustration name="allClear" size={150} />}
                headingAs="h3"
                title="No allowances scheduled"
                description="Set up a weekly or monthly allowance for a kid and it is paid from the pool on the day."
                action={
                  <Button asChild variant="secondary">
                    <ModuleLink to={`/h/${household.id}/allowances`}>Go to allowances</ModuleLink>
                  </Button>
                }
              />
            )
          }
          return (
            <>
              <ul className="ft-people ft-plain-list">
                {active.slice(0, 3).map((s) => {
                  const owner = ownerOf(s.toAccountId)
                  const name = owner ? memberName(owner) : accountName(s.toAccountId)
                  return (
                    <li key={s.id}>
                      <Avatar name={name} size="sm" decorative />
                      <div>
                        <strong>{accountName(s.toAccountId)}</strong>
                        <span className="ft-muted">
                          {s.frequency === 'WEEKLY' ? 'Weekly' : 'Monthly'}, next on{' '}
                          {formatCalendarDate(s.nextDueOn)}
                        </span>
                      </div>
                      <MoneyText minor={s.amountMinor} currency={currency} />
                    </li>
                  )
                })}
              </ul>
              <p>
                <ModuleLink to={`/h/${household.id}/allowances`}>Manage allowances</ModuleLink>
              </p>
            </>
          )
        }}
      </QueryState>
    </section>
  )
}

function KidDashboard() {
  const { household, myPot, currency, me } = useHousehold()
  const statement = useStatement(household.id, myPot?.id ?? '', { page: 0, size: 500 })
  return (
    <>
      <PageHeader
        eyebrow={<RoleBadge role={me.role} />}
        title={`Hi ${me.displayName ?? 'there'}`}
        description={`Your pot in the ${household.name} household.`}
      />
      <PoolHero />
      <ApprovalsPanel />
      <QueryState query={statement} loading={<LoadingBlock label="Loading activity" />}>
        {(s) => <RecentStatementRows rows={s.rows.slice(-5)} currency={currency} />}
      </QueryState>
    </>
  )
}

function FullDashboard() {
  const { household, trusted, role } = useHousehold()
  const entries = useEntries(household.id, 0, 6)
  const people = household.members.length
  return (
    <>
      <PageHeader
        eyebrow={<RoleBadge role={role} />}
        title={household.name}
        description={`${people} ${people === 1 ? 'person shares' : 'people share'} one pool in ${household.currency}. Every change is a ledger entry that can be reversed, never edited.`}
      />
      <PoolHero />
      <ApprovalsPanel />
      <PotTiles />
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
