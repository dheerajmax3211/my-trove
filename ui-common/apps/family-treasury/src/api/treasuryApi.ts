import type { ApiClient } from '@platform/api-client'
import type {
  AccountView,
  AddMemberRequest,
  AllowanceRun,
  ApprovalView,
  CreateHouseholdRequest,
  CreateScheduleRequest,
  DepositRequest,
  EntryView,
  HouseholdView,
  MemberView,
  ReconciliationReport,
  Role,
  RunStatus,
  ScheduleView,
  SpendRequest,
  SpendResult,
  SplitRequest,
  SplitResult,
  Statement,
  StatementQuery,
  TransferRequest,
  UpdateSettingsRequest,
} from './types'

export const IDEMPOTENCY_HEADER = 'Idempotency-Key'

const household = (id: string) => `/households/${id}`

function keyed(key: string): { headers: Record<string, string> } {
  return { headers: { [IDEMPOTENCY_HEADER]: key } }
}

/** "2026-11-02 PAID" -> { periodStart, status }. The backend's run log is a list of such strings. */
export function parseRunLine(line: string): AllowanceRun {
  const [periodStart = '', status = ''] = line.trim().split(/\s+/)
  return { periodStart, status: status as RunStatus }
}

/**
 * Typed wrapper over the family-treasury REST API (paths relative to `/v1`). Every mutating money call takes the
 * Idempotency-Key explicitly: callers own the "one key per user intent" rule, this layer only sends it.
 */
export function createTreasuryApi(client: ApiClient) {
  return {
    // ---- households ----
    listHouseholds: () => client.get<HouseholdView[]>('/households'),
    getHousehold: (id: string) => client.get<HouseholdView>(household(id)),
    createHousehold: (body: CreateHouseholdRequest, key: string) =>
      client.post<HouseholdView>('/households', body, keyed(key)),
    updateSettings: (id: string, body: UpdateSettingsRequest) =>
      client.put<HouseholdView>(`${household(id)}/settings`, body),
    addMember: (id: string, body: AddMemberRequest) =>
      client.post<MemberView>(`${household(id)}/members`, body),
    changeRole: (id: string, uid: string, role: Role) =>
      client.put<MemberView>(`${household(id)}/members/${encodeURIComponent(uid)}/role`, { role }),
    listAccounts: (id: string) => client.get<AccountView[]>(`${household(id)}/accounts`),

    // ---- ledger operations ----
    deposit: (id: string, body: DepositRequest, key: string) =>
      client.post<EntryView>(`${household(id)}/deposits`, body, keyed(key)),
    spend: (id: string, body: SpendRequest, key: string) =>
      client.post<SpendResult>(`${household(id)}/spends`, body, keyed(key)),
    transfer: (id: string, body: TransferRequest, key: string) =>
      client.post<EntryView>(`${household(id)}/transfers`, body, keyed(key)),
    split: (id: string, body: SplitRequest, key: string) =>
      client.post<SplitResult>(`${household(id)}/splits`, body, keyed(key)),
    reverse: (id: string, entryId: string, reason: string | null, key: string) =>
      client.post<EntryView>(`${household(id)}/entries/${entryId}/reverse`, { reason }, keyed(key)),
    listEntries: (id: string, page: number, size: number) =>
      client.get<EntryView[]>(`${household(id)}/entries`, { query: { page, size } }),

    // ---- approvals ----
    listApprovals: (id: string, status?: string) =>
      client.get<ApprovalView[]>(`${household(id)}/approvals`, { query: { status } }),
    approve: (id: string, approvalId: string, key: string) =>
      client.post<ApprovalView>(
        `${household(id)}/approvals/${approvalId}/approve`,
        undefined,
        keyed(key),
      ),
    reject: (id: string, approvalId: string, note: string | null, key: string) =>
      client.post<ApprovalView>(
        `${household(id)}/approvals/${approvalId}/reject`,
        { note },
        keyed(key),
      ),

    // ---- allowances ----
    listSchedules: (id: string) =>
      client.get<ScheduleView[]>(`${household(id)}/allowance-schedules`),
    createSchedule: (id: string, body: CreateScheduleRequest) =>
      client.post<ScheduleView>(`${household(id)}/allowance-schedules`, body),
    pauseSchedule: (id: string, scheduleId: string) =>
      client.delete<void>(`${household(id)}/allowance-schedules/${scheduleId}`),
    listRuns: async (id: string, scheduleId: string): Promise<AllowanceRun[]> => {
      const lines = await client.get<string[]>(
        `${household(id)}/allowance-schedules/${scheduleId}/runs`,
      )
      return lines.map(parseRunLine)
    },

    // ---- reports ----
    statement: (id: string, accountId: string, q: StatementQuery) =>
      client.get<Statement>(`${household(id)}/accounts/${accountId}/statement`, {
        query: { from: q.from, to: q.to, page: q.page, size: q.size },
      }),
    statementCsv: (id: string, accountId: string, q: Pick<StatementQuery, 'from' | 'to'>) =>
      client.get<string>(`${household(id)}/accounts/${accountId}/statement.csv`, {
        query: { from: q.from, to: q.to },
        headers: { Accept: 'text/csv' },
      }),
    reconcile: (id: string) => client.get<ReconciliationReport>(`${household(id)}/reconciliation`),
  }
}

export type TreasuryApi = ReturnType<typeof createTreasuryApi>
