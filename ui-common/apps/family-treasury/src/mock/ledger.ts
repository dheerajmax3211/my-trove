/**
 * In-memory ledger that behaves like the family-treasury backend: double-entry postings in signed minor units,
 * a balance projection, the overdraft rule, reversals, statements with running balances, CSV and reconciliation.
 * It exists so demo mode and the tests exercise the same contract (paths, status codes, problem codes) as the
 * real service. Deliberately framework-free.
 */
import type {
  AccountType,
  AccountView,
  AllowanceRun,
  ApprovalView,
  Drift,
  EntryKind,
  EntryView,
  HouseholdView,
  Imbalance,
  MemberView,
  ReconciliationReport,
  Role,
  ScheduleView,
  StatementRow,
} from '../api/types'

export class ApiProblem extends Error {
  readonly status: number
  readonly code: string | null
  constructor(status: number, code: string | null, detail: string) {
    super(detail)
    this.status = status
    this.code = code
  }
}

export const problem = {
  notFound: (what: string) => new ApiProblem(404, 'NOT_FOUND', `${what} not found`),
  forbidden: (code: string, detail: string) => new ApiProblem(403, code, detail),
  conflict: (code: string, detail: string) => new ApiProblem(409, code, detail),
  badRequest: (code: string | null, detail: string) => new ApiProblem(400, code, detail),
  unprocessable: (code: string, detail: string) => new ApiProblem(422, code, detail),
}

export interface AccountRec {
  id: string
  code: string
  name: string
  type: AccountType
  currency: string
  ownerUid: string | null
  allowNegative: boolean
}

/** An invite code. The mock keeps the code itself (the real service keeps only its hash). */
export interface InviteRec {
  id: string
  code: string
  role: Role
  createdByUid: string
  createdAt: Date
  expiresAt: Date
  usedAt: Date | null
}

export interface HouseholdRec {
  id: string
  name: string
  currency: string
  approvalThresholdMinor: number | null
  approvalExpiryHours: number
  createdAt: Date
  members: MemberView[]
  invites: InviteRec[]
  accounts: AccountRec[]
  /** The balance projection (raw signed sum of postings), like `account_balances`. */
  balances: Map<string, number>
  entries: EntryView[]
  entrySeq: Map<string, number>
  approvals: ApprovalView[]
  schedules: ScheduleView[]
  runs: Map<string, AllowanceRun[]>
}

export const POOL = 'POOL'
export const INCOME_DEPOSITS = 'INCOME:DEPOSITS'
export const EXPENSE_GENERAL = 'EXPENSE:GENERAL'
export const MAX_AMOUNT = 999_999_999_999_999

const debitNormal = (type: AccountType): boolean => type === 'ASSET' || type === 'EXPENSE'
export const natural = (type: AccountType, raw: number): number => (debitNormal(type) ? raw : -raw)

export const isTrusted = (role: Role): boolean => role === 'OWNER' || role === 'APPROVER'

export function member(h: HouseholdRec, uid: string): MemberView {
  const m = h.members.find((x) => x.uid === uid)
  if (!m) throw problem.notFound('household')
  return m
}

export function requireRole(h: HouseholdRec, uid: string, ...allowed: Role[]): MemberView {
  const m = member(h, uid)
  if (!allowed.includes(m.role)) {
    throw problem.forbidden('ROLE_NOT_ALLOWED', `role ${m.role} may not perform this action`)
  }
  return m
}

export function account(h: HouseholdRec, id: string): AccountRec {
  const a = h.accounts.find((x) => x.id === id)
  if (!a) throw problem.notFound('account')
  return a
}

export function accountByCode(h: HouseholdRec, code: string): AccountRec {
  const a = h.accounts.find((x) => x.code === code)
  if (!a) throw problem.notFound(`account ${code}`)
  return a
}

export function canDebit(m: MemberView, a: AccountRec): boolean {
  if (isTrusted(m.role)) return true
  if (m.role === 'MEMBER') return a.ownerUid === null || a.ownerUid === m.uid
  return m.uid === a.ownerUid
}

export function canView(m: MemberView, a: AccountRec): boolean {
  return m.role !== 'KID' || a.ownerUid === null || a.ownerUid === m.uid
}

export function accountView(h: HouseholdRec, a: AccountRec): AccountView {
  const raw = h.balances.get(a.id) ?? 0
  return { ...a, balanceMinor: natural(a.type, raw), rawBalanceMinor: raw }
}

export function householdView(h: HouseholdRec, viewer: MemberView | null): HouseholdView {
  return {
    id: h.id,
    name: h.name,
    currency: h.currency,
    approvalThresholdMinor: h.approvalThresholdMinor,
    approvalExpiryHours: h.approvalExpiryHours,
    createdAt: h.createdAt.toISOString(),
    members: viewer ? h.members.map((m) => ({ ...m })) : [],
    accounts: viewer
      ? h.accounts.filter((a) => canView(viewer, a)).map((a) => accountView(h, a))
      : [],
  }
}

export interface Line {
  accountId: string
  amount: number
}

export interface PostParams {
  id: string
  at: Date
  kind: EntryKind
  description: string
  reversesEntryId: string | null
  approvalId: string | null
  actorUid: string
  lines: Line[]
}

/** Validates (balanced, overdraft rule) and then writes entry + projection, like `LedgerEngine.post`. */
export function postEntry(h: HouseholdRec, p: PostParams): EntryView {
  if (p.lines.length < 2) throw new Error('an entry needs at least 2 lines')
  const delta = new Map<string, number>()
  for (const l of p.lines) {
    if (l.amount === 0) throw new Error('zero-amount line')
    delta.set(l.accountId, (delta.get(l.accountId) ?? 0) + l.amount)
  }
  const byCurrency = new Map<string, number>()
  const updated = new Map<string, number>()
  for (const [accountId, d] of delta) {
    const a = account(h, accountId)
    const next = (h.balances.get(accountId) ?? 0) + d
    const wrongSide = debitNormal(a.type) ? next < 0 : next > 0
    if (wrongSide && !a.allowNegative) {
      throw problem.unprocessable(
        'INSUFFICIENT_FUNDS',
        `account would be overdrawn (available ${natural(a.type, h.balances.get(accountId) ?? 0)} minor units)`,
      )
    }
    byCurrency.set(a.currency, (byCurrency.get(a.currency) ?? 0) + d)
    updated.set(accountId, next)
  }
  for (const sum of byCurrency.values()) if (sum !== 0) throw new Error('unbalanced entry')

  const entry: EntryView = {
    id: p.id,
    householdId: h.id,
    kind: p.kind,
    description: p.description,
    postedAt: p.at.toISOString(),
    reversesEntryId: p.reversesEntryId,
    approvalId: p.approvalId,
    createdByUid: p.actorUid,
    postings: p.lines.map((l) => ({
      accountId: l.accountId,
      amountMinor: l.amount,
      currency: account(h, l.accountId).currency,
    })),
  }
  h.entries.push(entry)
  h.entrySeq.set(entry.id, h.entries.length)
  for (const [accountId, next] of updated) h.balances.set(accountId, next)
  return entry
}

/** Literal port of the backend's `Money.allocateMinor` (largest remainder, ties to the lowest index). */
export function allocate(total: number, weights: number[]): number[] {
  const w = weights.map(BigInt)
  const sum = w.reduce((a, b) => a + b, 0n)
  if (w.length === 0 || sum === 0n)
    throw problem.badRequest('INVALID_REQUEST', 'at least one weight must be positive')
  const magnitude = BigInt(Math.abs(total))
  const floors = w.map((x) => (magnitude * x) / sum)
  const remainders = w.map((x) => (magnitude * x) % sum)
  let leftover = Number(magnitude - floors.reduce((a, b) => a + b, 0n))
  const order = w.flatMap((x, i) => (x > 0n ? [i] : []))
  order.sort((a, b) => {
    const ra = remainders[a]!
    const rb = remainders[b]!
    return ra === rb ? a - b : ra > rb ? -1 : 1
  })
  const out = floors.map(Number)
  for (let k = 0; leftover > 0; k += 1, leftover -= 1) out[order[k]!]! += 1
  return total < 0 ? out.map((x) => -x) : out
}

// ---- reads ---------------------------------------------------------------------------------------------

export function statementRows(h: HouseholdRec, a: AccountRec): StatementRow[] {
  const sign = debitNormal(a.type) ? 1 : -1
  let running = 0
  const rows: StatementRow[] = []
  for (const e of h.entries) {
    for (const p of e.postings) {
      if (p.accountId !== a.id) continue
      const amountMinor = p.amountMinor * sign
      running += amountMinor
      rows.push({
        seq: h.entrySeq.get(e.id) ?? 0,
        entryId: e.id,
        postedAt: e.postedAt,
        kind: e.kind,
        description: e.description,
        amountMinor,
        balanceMinor: running,
      })
    }
  }
  return rows
}

export function filterRows(
  rows: StatementRow[],
  from: string | null,
  to: string | null,
): StatementRow[] {
  const lo = from ? new Date(from).getTime() : null
  const hi = to ? new Date(to).getTime() : null
  return rows.filter((r) => {
    const t = new Date(r.postedAt).getTime()
    return (lo === null || t >= lo) && (hi === null || t < hi)
  })
}

/** RFC 4180 quoting plus neutralisation of spreadsheet formula injection, like `StatementService.cell`. */
export function csvCell(value: string): string {
  let v = value
  if (v !== '' && '=+-@\t\r'.includes(v[0]!)) v = `'${v}`
  if (/[",\n\r]/.test(v)) v = `"${v.replaceAll('"', '""')}"`
  return v
}

const digitsOf = (currency: string): number =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency }).resolvedOptions()
    .maximumFractionDigits!

function decimal(minor: number, currency: string): string {
  const digits = digitsOf(currency)
  const abs = String(Math.abs(minor)).padStart(digits + 1, '0')
  const body = digits === 0 ? abs : `${abs.slice(0, -digits)}.${abs.slice(-digits)}`
  return minor < 0 ? `-${body}` : body
}

/** Java's Instant.toString drops zero fractions. */
const instant = (iso: string): string => iso.replace('.000Z', 'Z')

export function statementCsv(rows: StatementRow[], currency: string): string {
  const lines = rows.map((r) =>
    [
      instant(r.postedAt),
      r.entryId,
      r.kind,
      csvCell(r.description),
      decimal(r.amountMinor, currency),
      decimal(r.balanceMinor, currency),
      currency,
    ].join(','),
  )
  return (
    ['posted_at,entry_id,kind,description,amount,balance,currency', ...lines].join('\r\n') + '\r\n'
  )
}

export function reconcile(h: HouseholdRec, now: Date): ReconciliationReport {
  const ledger = new Map<string, number>()
  const perCurrency = new Map<string, number>()
  for (const e of h.entries) {
    for (const p of e.postings) {
      ledger.set(p.accountId, (ledger.get(p.accountId) ?? 0) + p.amountMinor)
      perCurrency.set(p.currency, (perCurrency.get(p.currency) ?? 0) + p.amountMinor)
    }
  }
  const drifts: Drift[] = []
  for (const a of [...h.accounts].sort((x, y) => x.code.localeCompare(y.code))) {
    const projected = h.balances.has(a.id) ? (h.balances.get(a.id) ?? 0) : null
    const ledgerMinor = ledger.get(a.id) ?? 0
    const driftMinor = (projected ?? 0) - ledgerMinor
    if (projected === null || driftMinor !== 0) {
      drifts.push({
        accountId: a.id,
        code: a.code,
        projectedMinor: projected,
        ledgerMinor,
        driftMinor,
      })
    }
  }
  const ledgerImbalances: Imbalance[] = [...perCurrency]
    .filter(([, total]) => total !== 0)
    .map(([currency, totalMinor]) => ({ currency, totalMinor }))
  return {
    householdId: h.id,
    checkedAt: now.toISOString(),
    accountsChecked: h.accounts.length,
    consistent: drifts.length === 0 && ledgerImbalances.length === 0,
    drifts,
    ledgerImbalances,
  }
}
