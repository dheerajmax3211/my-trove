import {
  Avatar,
  Badge,
  BentoCard,
  BentoGrid,
  Button,
  CalendarIcon,
  EmptyState,
  Illustration,
  PageHeader,
  ShieldIcon,
} from '@platform/ui'
import { ModuleLink } from '@platform/workspace-kit'
import { CardState, type Slot } from '../../../components/CardState'
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
import { NoPotsCard, PotCard, potShares } from '../components/PotTiles'
import { RecentEntries, RecentStatementRows } from '../components/RecentActivity'
import { useHousehold } from '../hooks/useHousehold'

const SHOWN = 2

/**
 * Requests waiting for a second person, beside the balance. It turns lilac and shows the real approval cards when
 * there is something to decide (so a person who may decide can do it right here), and is a calm sentence when not.
 */
function ApprovalsCard({ className, style }: Slot) {
  const { household, isKid, trusted, currency } = useHousehold()
  const approvals = useApprovals(household.id, PENDING)
  const threshold = household.approvalThresholdMinor
  const title = isKid ? 'My requests' : 'Waiting for approval'
  return (
    <CardState
      query={approvals}
      title={title}
      icon={<ShieldIcon size={18} />}
      span={5}
      loadingLabel="Loading requests"
      errorTitle="We could not load the requests"
      {...(className ? { className } : {})}
      {...(style ? { style } : {})}
    >
      {(list) => (
        <BentoCard
          span={5}
          tone="light"
          title={title}
          icon={<ShieldIcon size={18} />}
          actions={
            list.length > 0 ? (
              <Badge variant="warning" dot>
                {list.length} {list.length === 1 ? 'request' : 'requests'}
              </Badge>
            ) : null
          }
          className={className}
          {...(style ? { style } : {})}
        >
          {list.length === 0 ? (
            <p className="ft-muted">
              {threshold === null
                ? 'This household sets no limit on spends, so nothing waits for a decision.'
                : `Nothing is waiting. A spend above ${formatMinor(threshold, currency)} will appear here for a second person to decide.`}{' '}
              <ModuleLink to={`/h/${household.id}/approvals`}>See past requests</ModuleLink>
            </p>
          ) : (
            <div className="ft-stack">
              <p className="ft-muted">
                {trusted
                  ? 'These spends are above the household limit. Nothing is recorded until another owner or approver decides.'
                  : 'Bigger spends wait for an owner or approver. You will see the outcome here.'}
              </p>
              <ul className="ft-approval-grid ft-plain-list">
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
            </div>
          )}
        </BentoCard>
      )}
    </CardState>
  )
}

function UpcomingAllowances({ className, style }: Slot) {
  const { household, accountName, currency, memberName, pots } = useHousehold()
  const schedules = useSchedules(household.id)
  const ownerOf = (accountId: string) => pots.find((p) => p.id === accountId)?.ownerUid ?? null
  return (
    <CardState
      query={schedules}
      title="Upcoming allowances"
      icon={<CalendarIcon size={18} />}
      span={5}
      loadingLabel="Loading allowances"
      {...(className ? { className } : {})}
      {...(style ? { style } : {})}
    >
      {(list) => {
        const active = list
          .filter((s) => s.active)
          .sort((a, b) => a.nextDueOn.localeCompare(b.nextDueOn))
        return (
          <BentoCard
            span={5}
            title="Upcoming allowances"
            icon={<CalendarIcon size={18} />}
            className={className}
            {...(style ? { style } : {})}
          >
            {active.length === 0 ? (
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
            ) : (
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
            )}
          </BentoCard>
        )
      }}
    </CardState>
  )
}

/** Recent ledger entries as a card; a loading and error card of the same size while they arrive. */
function ActivityCard({ span, className, style }: { span: number } & Slot) {
  const { household } = useHousehold()
  const entries = useEntries(household.id, 0, 6)
  return (
    <CardState
      query={entries}
      title="Recent activity"
      span={span}
      loadingLabel="Loading activity"
      {...(className ? { className } : {})}
      {...(style ? { style } : {})}
    >
      {(list) => (
        <RecentEntries
          entries={list}
          span={span}
          {...(className ? { className } : {})}
          {...(style ? { style } : {})}
        />
      )}
    </CardState>
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
      <BentoGrid>
        <PoolHero />
        <ApprovalsCard />
        <CardState
          query={statement}
          title="Recent activity"
          span={12}
          loadingLabel="Loading activity"
        >
          {(s) => <RecentStatementRows rows={s.rows.slice(-5)} currency={currency} />}
        </CardState>
      </BentoGrid>
    </>
  )
}

function FullDashboard() {
  const { household, trusted, role, pots } = useHousehold()
  const people = household.members.length
  const shares = potShares(pots)
  return (
    <>
      <PageHeader
        eyebrow={<RoleBadge role={role} />}
        title={household.name}
        description={`${people} ${people === 1 ? 'person shares' : 'people share'} one pool in ${household.currency}. Every change is a ledger entry that can be reversed, never edited.`}
      />
      <BentoGrid>
        <PoolHero />
        <ApprovalsCard />
        {pots.length === 0 ? (
          <NoPotsCard />
        ) : (
          pots.map((pot, i) => (
            <PotCard
              key={pot.id}
              pot={pot}
              share={shares[i] ?? 0}
              index={i}
              span={pots.length % 4 === 0 ? 3 : 4}
            />
          ))
        )}
        <ActivityCard span={trusted ? 7 : 12} />
        {trusted ? <UpcomingAllowances /> : null}
      </BentoGrid>
    </>
  )
}

export function DashboardPage() {
  const { isKid } = useHousehold()
  return isKid ? <KidDashboard /> : <FullDashboard />
}
