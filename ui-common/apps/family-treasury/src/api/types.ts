/** Typed mirror of the family-treasury backend DTOs. Money is always `number` minor units (backend `long`). */

export type Role = 'OWNER' | 'APPROVER' | 'MEMBER' | 'KID'
export const ROLES: readonly Role[] = ['OWNER', 'APPROVER', 'MEMBER', 'KID']

export type AccountType = 'ASSET' | 'EXPENSE' | 'LIABILITY' | 'EQUITY' | 'INCOME'

export type EntryKind = 'DEPOSIT' | 'SPEND' | 'TRANSFER' | 'SPLIT' | 'REVERSAL' | 'ALLOWANCE'

export type ApprovalStatus = 'PENDING_APPROVAL' | 'APPROVED' | 'REJECTED' | 'EXPIRED'

export type Frequency = 'WEEKLY' | 'MONTHLY'

export type RunStatus = 'PAID' | 'SKIPPED' | 'FAILED'

export interface MemberView {
  uid: string
  role: Role
  displayName: string | null
}

export interface AccountView {
  id: string
  code: string
  name: string
  type: AccountType
  currency: string
  ownerUid: string | null
  allowNegative: boolean
  /** On the account's natural side: healthy is positive. */
  balanceMinor: number
  rawBalanceMinor: number
}

export interface HouseholdView {
  id: string
  name: string
  currency: string
  approvalThresholdMinor: number | null
  approvalExpiryHours: number
  createdAt: string
  members: MemberView[]
  accounts: AccountView[]
}

export interface PostingView {
  accountId: string
  /** Signed: positive = debit, negative = credit. */
  amountMinor: number
  currency: string
}

export interface EntryView {
  id: string
  householdId: string
  kind: EntryKind
  description: string
  postedAt: string
  reversesEntryId: string | null
  approvalId: string | null
  createdByUid: string
  postings: PostingView[]
}

export interface ApprovalView {
  id: string
  householdId: string
  requestedByUid: string
  fromAccountId: string
  toAccountId: string
  amountMinor: number
  currency: string
  description: string
  status: ApprovalStatus
  expiresAt: string
  decidedByUid: string | null
  decidedAt: string | null
  decisionNote: string | null
  entryId: string | null
  createdAt: string
}

export interface SpendResult {
  status: 'POSTED' | 'PENDING_APPROVAL'
  entry: EntryView | null
  approval: ApprovalView | null
}

export interface SplitAllocation {
  accountId: string
  shareMinor: number
}

export interface SplitResult {
  entry: EntryView
  allocations: SplitAllocation[]
}

export interface ScheduleView {
  id: string
  fromAccountId: string
  toAccountId: string
  amountMinor: number
  currency: string
  frequency: Frequency
  startDate: string
  nextDueOn: string
  active: boolean
  description: string
}

export interface StatementRow {
  seq: number
  entryId: string
  postedAt: string
  kind: EntryKind
  description: string
  /** Natural side of the account: positive adds to a healthy balance. */
  amountMinor: number
  balanceMinor: number
}

export interface Statement {
  accountId: string
  code: string
  currency: string
  type: AccountType
  page: number
  size: number
  totalRows: number
  currentBalanceMinor: number
  rows: StatementRow[]
}

export interface Drift {
  accountId: string
  code: string
  projectedMinor: number | null
  ledgerMinor: number
  driftMinor: number
}

export interface Imbalance {
  currency: string
  totalMinor: number
}

export interface ReconciliationReport {
  householdId: string
  checkedAt: string
  accountsChecked: number
  consistent: boolean
  drifts: Drift[]
  ledgerImbalances: Imbalance[]
}

// ---- requests ----

export interface CreateHouseholdRequest {
  name: string
  currency: string
  approvalThresholdMinor: number | null
  approvalExpiryHours: number | null
}

export interface UpdateSettingsRequest {
  approvalThresholdMinor: number | null
  approvalExpiryHours: number
}

export interface AddMemberRequest {
  uid: string
  role: Role
  displayName: string | null
}

export interface DepositRequest {
  toAccountId: string
  incomeAccountId: string | null
  amountMinor: number
  description: string
}

export interface SpendRequest {
  fromAccountId: string
  /** null = the household's default "General spending" category (kids cannot see categories). */
  categoryAccountId: string | null
  amountMinor: number
  description: string
}

export interface TransferRequest {
  fromAccountId: string
  toAccountId: string
  amountMinor: number
  description: string
}

export interface SplitRequest {
  expenseAccountId: string
  totalMinor: number
  description: string
  shares: { accountId: string; weight: number }[]
}

export interface CreateScheduleRequest {
  fromAccountId: string | null
  toAccountId: string
  amountMinor: number
  frequency: Frequency
  startDate: string
  description: string
}

/** One line of the backend's run log ("2026-11-02 PAID"), parsed. */
export interface AllowanceRun {
  periodStart: string
  status: RunStatus
}

export interface StatementQuery {
  from?: string | undefined
  to?: string | undefined
  page?: number | undefined
  size?: number | undefined
}
