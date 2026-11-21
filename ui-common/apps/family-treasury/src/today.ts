import type { TodayItem } from '@platform/workspace-kit'
import { useQueries } from '@tanstack/react-query'
import { useNow } from './clock'
import { useTreasuryApi, useTreasuryQuery } from './api/hooks'
import { treasuryKeys } from './api/keys'
import type { HouseholdView, Role } from './api/types'
import { PENDING } from './features/approvals/hooks'
import { isTrusted } from './lib/permissions'
import { formatMinor } from './lib/money'
import { useViewerUid } from './viewer'

/** How far ahead an allowance counts as "due soon". */
export const ALLOWANCE_LOOKAHEAD_DAYS = 3

const DAY = 86_400_000

/** yyyy-mm-dd, `days` after the UTC calendar day of `from`. Allowance due dates are UTC calendar dates. */
function utcDayPlus(from: Date, days: number): string {
  return new Date(from.getTime() + days * DAY).toISOString().slice(0, 10)
}

const names = (household: HouseholdView) =>
  new Map(household.members.map((m) => [m.uid, m.displayName ?? m.uid]))
const accountName = (household: HouseholdView, id: string) =>
  household.accounts.find((a) => a.id === id)?.name ?? 'a pot'

interface Membership {
  household: HouseholdView
  role: Role
}

/**
 * What needs the viewer across every household they belong to, for the workspace "Today" feed:
 * - requests waiting for their decision (owners and approvers, never their own request): `warn`
 * - allowances due within three days (owners and approvers): `info`
 * - a reconciliation mismatch (owners): `danger`
 * Every `to` is module-relative. Items are built only from fetched data (ids from the ledger, dates from the server),
 * so the same data always yields the same items.
 */
export function useTodayItems(): { items: TodayItem[]; loading: boolean } {
  const api = useTreasuryApi()
  const uid = useViewerUid()
  const now = useNow()
  const households = useTreasuryQuery(treasuryKeys.households(), (a) => a.listHouseholds())

  // The list is a summary (no members or accounts): each household's detail says who you are in it.
  const listed = households.data ?? []
  const details = useQueries({
    queries: listed.map((h) => ({
      queryKey: treasuryKeys.detail(h.id),
      queryFn: () => api.getHousehold(h.id),
    })),
  })
  const memberships: Membership[] = details.flatMap((query) => {
    const household = query.data
    const me = household?.members.find((m) => m.uid === uid)
    return household && me ? [{ household, role: me.role }] : []
  })

  const approvals = useQueries({
    queries: memberships.map(({ household, role }) => ({
      queryKey: treasuryKeys.approvals(household.id, PENDING),
      queryFn: () => api.listApprovals(household.id, PENDING),
      enabled: isTrusted(role),
    })),
  })
  const schedules = useQueries({
    queries: memberships.map(({ household, role }) => ({
      queryKey: treasuryKeys.schedules(household.id),
      queryFn: () => api.listSchedules(household.id),
      enabled: isTrusted(role),
    })),
  })
  const reconciliations = useQueries({
    queries: memberships.map(({ household, role }) => ({
      queryKey: treasuryKeys.reconciliation(household.id),
      queryFn: () => api.reconcile(household.id),
      enabled: role === 'OWNER',
    })),
  })

  const items: TodayItem[] = []
  const lastDay = utcDayPlus(now, ALLOWANCE_LOOKAHEAD_DAYS)

  memberships.forEach(({ household }, index) => {
    const who = names(household)
    for (const approval of approvals[index]?.data ?? []) {
      if (approval.status !== PENDING || approval.requestedByUid === uid) continue
      items.push({
        id: `approval:${approval.id}`,
        title: `Decide on ${formatMinor(approval.amountMinor, approval.currency)}: ${approval.description}`,
        subtitle: `${household.name}. Requested by ${who.get(approval.requestedByUid) ?? 'a member'}`,
        dueAt: approval.expiresAt,
        severity: 'warn',
        to: `/h/${household.id}/approvals`,
      })
    }
    for (const schedule of schedules[index]?.data ?? []) {
      if (!schedule.active || schedule.nextDueOn > lastDay) continue
      items.push({
        id: `allowance:${schedule.id}`,
        title: `${formatMinor(schedule.amountMinor, schedule.currency)} allowance for ${accountName(household, schedule.toAccountId)}`,
        subtitle: `${household.name}. ${schedule.frequency === 'WEEKLY' ? 'Weekly' : 'Monthly'}`,
        dueAt: `${schedule.nextDueOn}T00:00:00.000Z`,
        severity: 'info',
        to: `/h/${household.id}/allowances`,
      })
    }
    const report = reconciliations[index]?.data
    if (
      report &&
      (!report.consistent || report.drifts.length > 0 || report.ledgerImbalances.length > 0)
    ) {
      const count = report.drifts.length + report.ledgerImbalances.length
      items.push({
        id: `reconciliation:${household.id}`,
        title: 'The ledger check found a mismatch',
        subtitle: `${household.name}. ${count} ${count === 1 ? 'item differs' : 'items differ'} from the ledger`,
        severity: 'danger',
        to: `/h/${household.id}/reconciliation`,
      })
    }
  })

  const loading =
    households.isLoading ||
    [...details, ...approvals, ...schedules, ...reconciliations].some((query) => query.isLoading)
  return { items, loading }
}
