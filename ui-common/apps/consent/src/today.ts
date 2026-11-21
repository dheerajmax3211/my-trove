import type { TodayItem } from '@platform/workspace-kit'
import type { AccessRequest, Grant } from './shared/api/types'
import { formatDuration } from './shared/lib/format'
import { requestExpiresAt } from './shared/lib/requests'
import { useGrants } from './features/grants/hooks/useGrants'
import { usePendingRequests } from './features/requests/hooks/useRequests'

const DAY_MS = 86_400_000
/** Grants ending within this window show up on Today. */
export const EXPIRY_WINDOW_MS = 7 * DAY_MS

/** The first scope, then "and N more", so a title stays one line. */
function scopeSummary(scopes: readonly string[]): string {
  const first = scopes[0] ?? 'your data'
  const rest = scopes.length - 1
  return rest > 0 ? `${first} and ${rest} more` : first
}

/**
 * What needs the owner today: every request waiting for a decision (always `warn`: nothing is shared until
 * they act), then grants that end within seven days. Most urgent first.
 */
export function buildTodayItems(
  requests: readonly AccessRequest[],
  grants: readonly Grant[],
  now: number = Date.now(),
): TodayItem[] {
  const pending: TodayItem[] = requests
    .filter((r) => r.status === 'PENDING')
    .map((r) => ({
      id: `request:${r.id}`,
      title: `${r.clientName} is asking to read your data`,
      subtitle: `${scopeSummary(r.scopes)} for ${formatDuration(r.durationSeconds)}. ${r.purpose}`,
      dueAt: requestExpiresAt(r),
      severity: 'warn' as const,
      to: '/requests',
    }))
    .sort((a, b) => Date.parse(a.dueAt ?? '') - Date.parse(b.dueAt ?? ''))

  const expiring: TodayItem[] = grants
    .filter((g) => g.status === 'ACTIVE')
    .filter((g) => {
      const left = Date.parse(g.expiresAt) - now
      return left > 0 && left <= EXPIRY_WINDOW_MS
    })
    .map((g) => ({
      id: `grant:${g.id}`,
      title: `${g.clientName} loses access soon`,
      subtitle: `Its access to ${scopeSummary(g.scopes)} ends on its own. Renew it by approving a new request.`,
      dueAt: g.expiresAt,
      severity: 'info' as const,
      to: '/grants',
    }))
    .sort((a, b) => Date.parse(a.dueAt ?? '') - Date.parse(b.dueAt ?? ''))

  return [...pending, ...expiring]
}

/** Today feed for the workspace home: reads through the module's API client, like every screen. */
export function useConsentToday(): { items: TodayItem[]; loading: boolean } {
  const requests = usePendingRequests()
  const grants = useGrants(false)
  const loading = requests.isPending || grants.isPending
  const items = buildTodayItems(requests.data ?? [], grants.data ?? [])
  return { items, loading }
}
