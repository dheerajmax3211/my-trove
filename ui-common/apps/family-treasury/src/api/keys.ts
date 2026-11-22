import type { StatementQuery } from './types'

/**
 * Query keys. Everything about one household lives under ['treasury', householdId, ...] so one invalidation after
 * any ledger write refreshes balances, activity, approvals and statements together.
 */
export const treasuryKeys = {
  all: ['treasury'] as const,
  households: () => ['treasury', 'households'] as const,
  household: (id: string) => ['treasury', id] as const,
  detail: (id: string) => ['treasury', id, 'detail'] as const,
  entries: (id: string, page: number, size: number) =>
    ['treasury', id, 'entries', page, size] as const,
  approvals: (id: string, status: string | null) => ['treasury', id, 'approvals', status] as const,
  reconciliation: (id: string) => ['treasury', id, 'reconciliation'] as const,
  invites: (id: string) => ['treasury', id, 'invites'] as const,
  schedules: (id: string) => ['treasury', id, 'schedules'] as const,
  runs: (id: string, scheduleId: string) => ['treasury', id, 'runs', scheduleId] as const,
  statement: (id: string, accountId: string, q: StatementQuery) =>
    [
      'treasury',
      id,
      'statement',
      accountId,
      q.from ?? null,
      q.to ?? null,
      q.page ?? 0,
      q.size ?? 50,
    ] as const,
}
