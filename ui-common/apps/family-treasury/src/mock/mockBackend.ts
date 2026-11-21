/**
 * HTTP-level mock of the family-treasury REST API (`/v1/...`), same paths, status codes, Idempotency-Key semantics
 * and RFC 9457 problem documents (`code` extension) as the real service. Used by demo mode and by every test.
 *
 * Auth: the bearer token is `demo:<uid>` (see demoAuth.ts). Anything else is a 401.
 */
import type {
  AccountType,
  ApprovalView,
  EntryView,
  Frequency,
  HouseholdView,
  MemberView,
  Role,
  ScheduleView,
  SpendResult,
  SplitResult,
} from '../api/types'
import {
  ApiProblem,
  EXPENSE_GENERAL,
  INCOME_DEPOSITS,
  MAX_AMOUNT,
  POOL,
  account,
  accountByCode,
  accountView,
  allocate,
  canDebit,
  canView,
  filterRows,
  householdView,
  isTrusted,
  member,
  postEntry,
  problem,
  reconcile,
  requireRole,
  statementCsv,
  statementRows,
  type AccountRec,
  type HouseholdRec,
  type Line,
} from './ledger'

export interface MockBackendOptions {
  now?: () => Date
  /** Simulated network latency. 0 (default) resolves on the next microtask: deterministic for tests. */
  latencyMs?: number
}

export interface RecordedRequest {
  method: string
  /** Path relative to `/v1`, without query. */
  path: string
  query: Record<string, string>
  headers: Record<string, string>
  body: unknown
  uid: string | null
}

interface Ctx {
  uid: string
  params: Record<string, string>
  query: URLSearchParams
  body: unknown
  idemKey: string | null
  path: string
}

interface Reply {
  status: number
  body?: unknown
  text?: string
  headers?: Record<string, string>
}

type Handler = (ctx: Ctx) => Reply

interface Route {
  method: string
  pattern: RegExp
  names: string[]
  handler: Handler
}

const STATUS_TITLE: Record<number, string> = {
  400: 'Bad Request',
  401: 'Unauthorized',
  403: 'Forbidden',
  404: 'Not Found',
  409: 'Conflict',
  422: 'Unprocessable Entity',
  500: 'Internal Server Error',
}

const invalid = (): never => {
  throw problem.badRequest(null, 'Invalid request content.')
}
const isObject = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v)
const obj = (v: unknown): Record<string, unknown> => (isObject(v) ? v : invalid())
const money = (v: unknown, max = MAX_AMOUNT): number =>
  typeof v === 'number' && Number.isSafeInteger(v) && v > 0 && v <= max ? v : invalid()
const str = (v: unknown, max: number): string =>
  typeof v === 'string' && v.trim() !== '' && v.length <= max ? v : invalid()
const optStr = (v: unknown, max: number): string | null =>
  v === null || v === undefined ? null : typeof v === 'string' && v.length <= max ? v : invalid()
const optId = (v: unknown): string | null => (v === null || v === undefined ? null : str(v, 128))
const ROLE_VALUES: readonly string[] = ['OWNER', 'APPROVER', 'MEMBER', 'KID']
const role = (v: unknown): Role =>
  typeof v === 'string' && ROLE_VALUES.includes(v) ? (v as Role) : invalid()
const KEY_PATTERN = /^[A-Za-z0-9._:~-]{1,128}$/

function compile(method: string, path: string, handler: Handler): Route {
  const names: string[] = []
  const source = path.replace(/:([a-zA-Z]+)/g, (_m, name: string) => {
    names.push(name)
    return '([^/]+)'
  })
  return { method, pattern: new RegExp(`^${source}$`), names, handler }
}

export class MockBackend {
  readonly now: () => Date
  readonly households: HouseholdRec[] = []
  /** Every request the app sent, in order (assert on request shapes and counts). */
  readonly requests: RecordedRequest[] = []
  readonly fetch: typeof fetch

  private readonly latencyMs: number
  private readonly idem = new Map<string, { hash: string; status: number; body: unknown }>()
  private readonly routes: Route[]
  private idSeq = 0
  private dropCount = 0
  private broken: { pattern: RegExp; status: number }[] = []

  constructor(options: MockBackendOptions = {}) {
    this.now = options.now ?? (() => new Date())
    this.latencyMs = options.latencyMs ?? 0
    this.fetch = (input, init) => this.handle(input, init)
    this.routes = this.buildRoutes()
  }

  // ---- test & seeding hooks ---------------------------------------------------------------------------

  nextId(): string {
    this.idSeq += 1
    return `00000000-0000-4000-8000-${String(this.idSeq).padStart(12, '0')}`
  }

  /** The next `count` responses are lost AFTER the server committed the work (a network failure at the worst time). */
  dropNextResponses(count = 1): void {
    this.dropCount = count
  }

  /** Every request whose path matches answers with this status (default 500) until `repair()`. */
  breakRoute(pattern: RegExp, status = 500): void {
    this.broken.push({ pattern, status })
  }

  repair(): void {
    this.broken = []
  }

  household(id: string): HouseholdRec {
    const h = this.households.find((x) => x.id === id)
    if (!h) throw problem.notFound('household')
    return h
  }

  householdByName(name: string): HouseholdRec {
    const h = this.households.find((x) => x.name === name)
    if (!h) throw new Error(`no household named ${name}`)
    return h
  }

  accountOf(householdId: string, code: string): AccountRec {
    return accountByCode(this.household(householdId), code)
  }

  /** Natural-side balance of an account, by code. */
  balanceOf(householdId: string, code: string): number {
    const h = this.household(householdId)
    return accountView(h, accountByCode(h, code)).balanceMinor
  }

  /** Corrupts the balance projection of one account (reconciliation should then report drift). */
  injectDrift(householdId: string, code: string, deltaMinor: number): void {
    const h = this.household(householdId)
    const a = accountByCode(h, code)
    h.balances.set(a.id, (h.balances.get(a.id) ?? 0) + deltaMinor)
  }

  createHousehold(input: {
    name: string
    currency: string
    ownerUid: string
    ownerName: string | null
    approvalThresholdMinor: number | null
    approvalExpiryHours?: number
    createdAt?: Date
  }): HouseholdRec {
    const h: HouseholdRec = {
      id: this.nextId(),
      name: input.name,
      currency: input.currency,
      approvalThresholdMinor: input.approvalThresholdMinor,
      approvalExpiryHours: input.approvalExpiryHours ?? 72,
      createdAt: input.createdAt ?? this.now(),
      members: [],
      accounts: [],
      balances: new Map(),
      entries: [],
      entrySeq: new Map(),
      approvals: [],
      schedules: [],
      runs: new Map(),
    }
    this.households.push(h)
    this.addAccount(h, null, POOL, 'Household pool', 'ASSET', input.currency, false)
    this.addAccount(h, null, INCOME_DEPOSITS, 'Deposits', 'INCOME', input.currency, false)
    this.addAccount(h, null, EXPENSE_GENERAL, 'General spending', 'EXPENSE', input.currency, false)
    this.addMember(h, input.ownerUid, 'OWNER', input.ownerName)
    return h
  }

  addMember(
    h: HouseholdRec,
    uid: string,
    memberRole: Role,
    displayName: string | null,
  ): MemberView {
    if (h.members.some((m) => m.uid === uid)) {
      throw problem.conflict('ALREADY_MEMBER', 'user is already a member')
    }
    const m: MemberView = { uid, role: memberRole, displayName }
    h.members.push(m)
    this.addAccount(
      h,
      uid,
      `POT:${uid}`,
      displayName ? `${displayName} pot` : `Pot of ${uid}`,
      'ASSET',
      h.currency,
      false,
    )
    return m
  }

  addAccount(
    h: HouseholdRec,
    ownerUid: string | null,
    code: string,
    name: string,
    type: AccountType,
    currency: string,
    allowNegative: boolean,
  ): AccountRec {
    if (h.accounts.some((a) => a.code === code)) {
      throw problem.conflict('ACCOUNT_CODE_TAKEN', `account code already exists: ${code}`)
    }
    const a: AccountRec = { id: this.nextId(), code, name, type, currency, ownerUid, allowNegative }
    h.accounts.push(a)
    h.balances.set(a.id, 0)
    return a
  }

  /** Posts straight into the ledger (seeding), bypassing HTTP, roles and approvals. */
  post(
    h: HouseholdRec,
    kind: EntryView['kind'],
    description: string,
    actorUid: string,
    lines: { code: string; amount: number }[],
    at: Date = this.now(),
    extra: { reversesEntryId?: string | null; approvalId?: string | null } = {},
  ): EntryView {
    return postEntry(h, {
      id: this.nextId(),
      at,
      kind,
      description,
      reversesEntryId: extra.reversesEntryId ?? null,
      approvalId: extra.approvalId ?? null,
      actorUid,
      lines: lines.map((l) => ({ accountId: accountByCode(h, l.code).id, amount: l.amount })),
    })
  }

  createApproval(
    h: HouseholdRec,
    requestedByUid: string,
    description: string,
    amountMinor: number,
    createdAt: Date = this.now(),
    fromCode = POOL,
    categoryCode = EXPENSE_GENERAL,
  ): ApprovalView {
    const a: ApprovalView = {
      id: this.nextId(),
      householdId: h.id,
      requestedByUid,
      fromAccountId: accountByCode(h, fromCode).id,
      toAccountId: accountByCode(h, categoryCode).id,
      amountMinor,
      currency: h.currency,
      description,
      status: 'PENDING_APPROVAL',
      expiresAt: new Date(createdAt.getTime() + h.approvalExpiryHours * 3_600_000).toISOString(),
      decidedByUid: null,
      decidedAt: null,
      decisionNote: null,
      entryId: null,
      createdAt: createdAt.toISOString(),
    }
    h.approvals.push(a)
    return a
  }

  // ---- HTTP ----------------------------------------------------------------------------------------------

  private async handle(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
    const raw = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url
    const url = new URL(raw, 'http://mock.local')
    const method = (init?.method ?? 'GET').toUpperCase()
    const path = url.pathname.replace(/^.*?\/v1(?=\/|$)/, '') || '/'
    const headers = new Headers(init?.headers)
    const bearer = headers.get('authorization')?.replace(/^Bearer /, '') ?? null
    const uid = bearer?.startsWith('demo:') ? bearer.slice('demo:'.length) : null
    let body: unknown = undefined
    if (typeof init?.body === 'string' && init.body !== '') body = JSON.parse(init.body) as unknown

    this.requests.push({
      method,
      path,
      query: Object.fromEntries(url.searchParams),
      headers: Object.fromEntries(headers),
      body,
      uid,
    })

    if (this.latencyMs > 0) await new Promise((r) => setTimeout(r, this.latencyMs))
    else await Promise.resolve()

    if (!uid)
      return this.problemResponse(
        new ApiProblem(401, null, 'Missing or invalid bearer token.'),
        path,
      )

    const failing = this.broken.find((b) => b.pattern.test(path))
    if (failing) {
      return this.problemResponse(
        new ApiProblem(failing.status, 'INTERNAL_ERROR', 'unexpected error'),
        path,
      )
    }

    let response: Response
    try {
      response = this.dispatch(method, path, {
        uid,
        query: url.searchParams,
        body,
        idemKey: headers.get('idempotency-key'),
        path,
      })
    } catch (error) {
      if (error instanceof ApiProblem) response = this.problemResponse(error, path)
      else {
        response = this.problemResponse(
          new ApiProblem(500, 'INTERNAL_ERROR', 'unexpected error'),
          path,
        )
      }
    }
    if (this.dropCount > 0) {
      this.dropCount -= 1
      throw new TypeError('Failed to fetch')
    }
    return response
  }

  private problemResponse(error: ApiProblem, instance: string): Response {
    return new Response(
      JSON.stringify({
        type: 'about:blank',
        title: STATUS_TITLE[error.status] ?? `HTTP ${error.status}`,
        status: error.status,
        detail: error.message,
        instance: `/v1${instance}`,
        ...(error.code ? { code: error.code } : {}),
      }),
      { status: error.status, headers: { 'content-type': 'application/problem+json' } },
    )
  }

  private dispatch(method: string, path: string, base: Omit<Ctx, 'params'>): Response {
    for (const route of this.routes) {
      if (route.method !== method) continue
      const match = route.pattern.exec(path)
      if (!match) continue
      const params: Record<string, string> = {}
      route.names.forEach((name, i) => (params[name] = decodeURIComponent(match[i + 1] ?? '')))
      const reply = route.handler({ ...base, params })
      const headers = new Headers(reply.headers)
      if (reply.text !== undefined) {
        headers.set('content-type', 'text/csv')
        return new Response(reply.text, { status: reply.status, headers })
      }
      if (reply.body === undefined) return new Response(null, { status: reply.status, headers })
      headers.set('content-type', 'application/json')
      return new Response(JSON.stringify(reply.body), { status: reply.status, headers })
    }
    throw problem.notFound(`${method} ${path}`)
  }

  /** Exactly-once semantics for write operations, keyed by (scope, Idempotency-Key). Failures are not recorded. */
  private idempotent(scope: string, ctx: Ctx, fingerprint: unknown, work: () => Reply): Reply {
    const key = ctx.idemKey
    if (key === null)
      throw problem.badRequest(null, "Required header 'Idempotency-Key' is not present.")
    if (!KEY_PATTERN.test(key)) {
      throw problem.badRequest(
        'INVALID_IDEMPOTENCY_KEY',
        'Idempotency-Key must be 1-128 characters from [A-Za-z0-9._:~-]',
      )
    }
    const id = `${scope}|${key}`
    const hash = JSON.stringify(fingerprint)
    const existing = this.idem.get(id)
    if (existing) {
      if (existing.hash !== hash) {
        throw problem.conflict(
          'IDEMPOTENCY_KEY_REUSED',
          'this Idempotency-Key was already used with a different request',
        )
      }
      return {
        status: existing.status,
        body: structuredClone(existing.body),
        headers: { 'Idempotent-Replayed': 'true' },
      }
    }
    const result = work()
    this.idem.set(id, { hash, status: result.status, body: structuredClone(result.body) })
    return result
  }

  private expect(
    h: HouseholdRec,
    id: string | null,
    defaultCode: string | null,
    type: AccountType,
  ): AccountRec {
    const a = id === null ? accountByCode(h, defaultCode ?? '') : account(h, id)
    if (a.type !== type) {
      throw problem.unprocessable('WRONG_ACCOUNT_TYPE', `account ${a.code} must be of type ${type}`)
    }
    return a
  }

  private sameCurrency(a: AccountRec, b: AccountRec): void {
    if (a.currency !== b.currency) {
      throw problem.unprocessable(
        'CURRENCY_MISMATCH',
        `accounts ${a.code} and ${b.code} use different currencies`,
      )
    }
  }

  private effective(a: ApprovalView): ApprovalView {
    const expired =
      a.status === 'PENDING_APPROVAL' && new Date(a.expiresAt).getTime() <= this.now().getTime()
    return expired ? { ...a, status: 'EXPIRED' } : { ...a }
  }

  private requireDecidable(a: ApprovalView): void {
    if (a.status === 'EXPIRED')
      throw problem.conflict('APPROVAL_EXPIRED', 'approval request has expired')
    if (a.status !== 'PENDING_APPROVAL') {
      throw problem.conflict('ALREADY_DECIDED', `approval request is already ${a.status}`)
    }
  }

  private findApproval(h: HouseholdRec, id: string): ApprovalView {
    const a = h.approvals.find((x) => x.id === id)
    if (!a) throw problem.notFound('approval request')
    return a
  }

  private findEntry(h: HouseholdRec, id: string): EntryView {
    const e = h.entries.find((x) => x.id === id)
    if (!e) throw problem.notFound('entry')
    return e
  }

  private scheduleOf(h: HouseholdRec, id: string): ScheduleView {
    const s = h.schedules.find((x) => x.id === id)
    if (!s) throw problem.notFound('schedule')
    return s
  }

  private buildRoutes(): Route[] {
    const r = (method: string, path: string, handler: Handler) => compile(method, path, handler)
    const hh = (ctx: Ctx) => this.household(ctx.params.h ?? '')

    return [
      r('GET', '/households', (ctx) => ({
        status: 200,
        body: this.households
          .filter((h) => h.members.some((m) => m.uid === ctx.uid))
          .map((h) => householdView(h, null)),
      })),

      r('POST', '/households', (ctx) => {
        const body = obj(ctx.body)
        const name = str(body.name, 200)
        const currency =
          typeof body.currency === 'string' && /^[A-Z]{3}$/.test(body.currency)
            ? body.currency
            : invalid()
        const threshold =
          body.approvalThresholdMinor === null || body.approvalThresholdMinor === undefined
            ? null
            : typeof body.approvalThresholdMinor === 'number' &&
                Number.isSafeInteger(body.approvalThresholdMinor) &&
                body.approvalThresholdMinor >= 0 &&
                body.approvalThresholdMinor <= MAX_AMOUNT
              ? body.approvalThresholdMinor
              : invalid()
        const hours =
          body.approvalExpiryHours === null || body.approvalExpiryHours === undefined
            ? 72
            : typeof body.approvalExpiryHours === 'number' &&
                Number.isInteger(body.approvalExpiryHours) &&
                body.approvalExpiryHours >= 1 &&
                body.approvalExpiryHours <= 8760
              ? body.approvalExpiryHours
              : invalid()
        return this.idempotent(`user:${ctx.uid}`, ctx, ['create-household', ctx.uid, body], () => {
          try {
            new Intl.NumberFormat('en-US', { style: 'currency', currency })
          } catch {
            throw problem.badRequest('INVALID_REQUEST', `unknown currency: ${currency}`)
          }
          const h = this.createHousehold({
            name,
            currency,
            ownerUid: ctx.uid,
            ownerName: null,
            approvalThresholdMinor: threshold,
            approvalExpiryHours: hours,
          })
          return { status: 201, body: householdView(h, member(h, ctx.uid)) }
        })
      }),

      r('GET', '/households/:h', (ctx) => {
        const h = hh(ctx)
        return { status: 200, body: householdView(h, member(h, ctx.uid)) satisfies HouseholdView }
      }),

      r('PUT', '/households/:h/settings', (ctx) => {
        const h = hh(ctx)
        requireRole(h, ctx.uid, 'OWNER')
        const body = obj(ctx.body)
        const threshold =
          body.approvalThresholdMinor === null || body.approvalThresholdMinor === undefined
            ? null
            : typeof body.approvalThresholdMinor === 'number' &&
                Number.isSafeInteger(body.approvalThresholdMinor) &&
                body.approvalThresholdMinor >= 0 &&
                body.approvalThresholdMinor <= MAX_AMOUNT
              ? body.approvalThresholdMinor
              : invalid()
        const hours =
          typeof body.approvalExpiryHours === 'number' &&
          Number.isInteger(body.approvalExpiryHours) &&
          body.approvalExpiryHours >= 1 &&
          body.approvalExpiryHours <= 8760
            ? body.approvalExpiryHours
            : invalid()
        h.approvalThresholdMinor = threshold
        h.approvalExpiryHours = hours
        return { status: 200, body: householdView(h, member(h, ctx.uid)) }
      }),

      r('GET', '/households/:h/members', (ctx) => {
        const h = hh(ctx)
        member(h, ctx.uid)
        return { status: 200, body: h.members.map((m) => ({ ...m })) }
      }),

      r('POST', '/households/:h/members', (ctx) => {
        const h = hh(ctx)
        requireRole(h, ctx.uid, 'OWNER')
        const body = obj(ctx.body)
        const m = this.addMember(
          h,
          str(body.uid, 128),
          role(body.role),
          optStr(body.displayName, 200),
        )
        return { status: 201, body: { ...m } }
      }),

      r('PUT', '/households/:h/members/:uid/role', (ctx) => {
        const h = hh(ctx)
        requireRole(h, ctx.uid, 'OWNER')
        const target = member(h, ctx.params.uid ?? '')
        const next = role(obj(ctx.body).role)
        if (
          target.role === 'OWNER' &&
          next !== 'OWNER' &&
          h.members.filter((m) => m.role === 'OWNER').length <= 1
        ) {
          throw problem.conflict('LAST_OWNER', 'a household needs at least one OWNER')
        }
        target.role = next
        return { status: 200, body: { ...target } }
      }),

      r('GET', '/households/:h/accounts', (ctx) => {
        const h = hh(ctx)
        const me = member(h, ctx.uid)
        return {
          status: 200,
          body: h.accounts.filter((a) => canView(me, a)).map((a) => accountView(h, a)),
        }
      }),

      r('POST', '/households/:h/accounts', (ctx) => {
        const h = hh(ctx)
        requireRole(h, ctx.uid, 'OWNER', 'APPROVER')
        const body = obj(ctx.body)
        const types: readonly string[] = ['ASSET', 'EXPENSE', 'LIABILITY', 'EQUITY', 'INCOME']
        const type =
          typeof body.type === 'string' && types.includes(body.type)
            ? (body.type as AccountType)
            : invalid()
        const ownerUid = optStr(body.ownerUid, 128)
        if (ownerUid && !h.members.some((m) => m.uid === ownerUid)) {
          throw problem.badRequest('OWNER_NOT_MEMBER', 'ownerUid is not a member of this household')
        }
        const a = this.addAccount(
          h,
          ownerUid,
          str(body.code, 160),
          str(body.name, 200),
          type,
          optStr(body.currency, 3) ?? h.currency,
          body.allowNegative === true,
        )
        return { status: 201, body: accountView(h, a) }
      }),

      r('GET', '/households/:h/accounts/:a', (ctx) => {
        const h = hh(ctx)
        const me = member(h, ctx.uid)
        const a = account(h, ctx.params.a ?? '')
        if (!canView(me, a)) throw problem.notFound('account')
        return { status: 200, body: accountView(h, a) }
      }),

      // ---- ledger operations -------------------------------------------------------------------------

      r('POST', '/households/:h/deposits', (ctx) => {
        const h = hh(ctx)
        const me = member(h, ctx.uid)
        const body = obj(ctx.body)
        const toId = optId(body.toAccountId)
        const incomeId = optId(body.incomeAccountId)
        const amount = money(body.amountMinor)
        const description = str(body.description, 500)
        return this.idempotent(h.id, ctx, ['deposit', ctx.uid, body], () => {
          if (me.role === 'KID') throw problem.forbidden('ROLE_NOT_ALLOWED', 'kids cannot deposit')
          const to = this.expect(h, toId, POOL, 'ASSET')
          const income = this.expect(h, incomeId, INCOME_DEPOSITS, 'INCOME')
          this.sameCurrency(to, income)
          const e = this.postUserEntry(h, 'DEPOSIT', description, ctx.uid, [
            { accountId: to.id, amount },
            { accountId: income.id, amount: -amount },
          ])
          return { status: 201, body: e }
        })
      }),

      r('POST', '/households/:h/spends', (ctx) => {
        const h = hh(ctx)
        const me = member(h, ctx.uid)
        const body = obj(ctx.body)
        const fromId = optId(body.fromAccountId)
        const categoryId = optId(body.categoryAccountId)
        const amount = money(body.amountMinor)
        const description = str(body.description, 500)
        return this.idempotent(h.id, ctx, ['spend', ctx.uid, body], () => {
          const from = this.expect(h, fromId, POOL, 'ASSET')
          const category = this.expect(h, categoryId, EXPENSE_GENERAL, 'EXPENSE')
          this.sameCurrency(from, category)
          if (!canDebit(me, from)) {
            throw problem.forbidden('ACCOUNT_NOT_ALLOWED', `you may not spend from ${from.code}`)
          }
          if (h.approvalThresholdMinor !== null && amount > h.approvalThresholdMinor) {
            const approval = this.createApproval(
              h,
              ctx.uid,
              description,
              amount,
              this.now(),
              from.code,
              category.code,
            )
            const result: SpendResult = {
              status: 'PENDING_APPROVAL',
              entry: null,
              approval: { ...approval },
            }
            return { status: 202, body: result }
          }
          const entry = this.postUserEntry(h, 'SPEND', description, ctx.uid, [
            { accountId: from.id, amount: -amount },
            { accountId: category.id, amount },
          ])
          const result: SpendResult = { status: 'POSTED', entry, approval: null }
          return { status: 201, body: result }
        })
      }),

      r('POST', '/households/:h/transfers', (ctx) => {
        const h = hh(ctx)
        const me = member(h, ctx.uid)
        const body = obj(ctx.body)
        const fromId = str(body.fromAccountId, 128)
        const toId = str(body.toAccountId, 128)
        const amount = money(body.amountMinor)
        const description = str(body.description, 500)
        return this.idempotent(h.id, ctx, ['transfer', ctx.uid, body], () => {
          if (fromId === toId)
            throw problem.badRequest('SAME_ACCOUNT', 'source and destination must differ')
          const from = this.expect(h, fromId, null, 'ASSET')
          const to = this.expect(h, toId, null, 'ASSET')
          this.sameCurrency(from, to)
          const allowed = from.ownerUid === null ? isTrusted(me.role) : canDebit(me, from)
          if (!allowed)
            throw problem.forbidden(
              'ACCOUNT_NOT_ALLOWED',
              `you may not transfer out of ${from.code}`,
            )
          const e = this.postUserEntry(h, 'TRANSFER', description, ctx.uid, [
            { accountId: from.id, amount: -amount },
            { accountId: to.id, amount },
          ])
          return { status: 201, body: e }
        })
      }),

      r('POST', '/households/:h/splits', (ctx) => {
        const h = hh(ctx)
        const me = member(h, ctx.uid)
        const body = obj(ctx.body)
        const expenseId = optId(body.expenseAccountId)
        const total = money(body.totalMinor)
        const description = str(body.description, 500)
        const rawShares =
          Array.isArray(body.shares) && body.shares.length > 0 && body.shares.length <= 50
            ? (body.shares as unknown[])
            : invalid()
        const shares = rawShares.map((s) => {
          const o = obj(s)
          const weight =
            o.weight === null || o.weight === undefined ? null : money(o.weight, 1_000_000)
          return { accountId: str(o.accountId, 128), weight }
        })
        return this.idempotent(h.id, ctx, ['split', ctx.uid, body], () => {
          const expense = this.expect(h, expenseId, EXPENSE_GENERAL, 'EXPENSE')
          const seen = new Set<string>()
          const pots = shares.map((s) => {
            if (seen.has(s.accountId)) {
              throw problem.badRequest(
                'DUPLICATE_SHARE',
                'an account may appear only once in a split',
              )
            }
            seen.add(s.accountId)
            const pot = account(h, s.accountId)
            if (pot.type !== 'ASSET' || pot.ownerUid === null) {
              throw problem.unprocessable('WRONG_ACCOUNT_TYPE', 'split shares must be member pots')
            }
            this.sameCurrency(pot, expense)
            if (!canDebit(me, pot)) {
              throw problem.forbidden('ACCOUNT_NOT_ALLOWED', `you may not draw on ${pot.code}`)
            }
            return pot
          })
          const parts = allocate(
            total,
            shares.map((s) => s.weight ?? 1),
          )
          const lines: Line[] = [{ accountId: expense.id, amount: total }]
          parts.forEach((part, i) => {
            if (part !== 0) lines.push({ accountId: pots[i]!.id, amount: -part })
          })
          const entry = this.postUserEntry(h, 'SPLIT', description, ctx.uid, lines)
          const result: SplitResult = {
            entry,
            allocations: parts.map((shareMinor, i) => ({ accountId: pots[i]!.id, shareMinor })),
          }
          return { status: 201, body: result }
        })
      }),

      r('POST', '/households/:h/entries/:e/reverse', (ctx) => {
        const h = hh(ctx)
        requireRole(h, ctx.uid, 'OWNER', 'APPROVER')
        const body = ctx.body === undefined ? {} : obj(ctx.body)
        const reason = optStr(body.reason, 300)
        return this.idempotent(h.id, ctx, ['reverse', ctx.uid, ctx.params.e, body], () => {
          const original = this.findEntry(h, ctx.params.e ?? '')
          if (original.kind === 'REVERSAL') {
            throw problem.unprocessable(
              'CANNOT_REVERSE_REVERSAL',
              'a reversal entry cannot itself be reversed',
            )
          }
          if (h.entries.some((e) => e.reversesEntryId === original.id)) {
            throw problem.conflict('ALREADY_REVERSED', 'entry has already been reversed')
          }
          const suffix = reason && reason.trim() !== '' ? ` (${reason})` : ''
          const description = `Reversal of: ${original.description}${suffix}`.slice(0, 500)
          const e = this.postUserEntry(
            h,
            'REVERSAL',
            description,
            ctx.uid,
            original.postings.map((p) => ({ accountId: p.accountId, amount: -p.amountMinor })),
            original.id,
          )
          return { status: 201, body: e }
        })
      }),

      r('GET', '/households/:h/entries/:e', (ctx) => {
        const h = hh(ctx)
        const me = member(h, ctx.uid)
        if (me.role === 'KID')
          throw problem.forbidden('ROLE_NOT_ALLOWED', 'kids cannot read journal entries')
        return { status: 200, body: this.findEntry(h, ctx.params.e ?? '') }
      }),

      r('GET', '/households/:h/entries', (ctx) => {
        const h = hh(ctx)
        const me = member(h, ctx.uid)
        if (me.role === 'KID')
          throw problem.forbidden('ROLE_NOT_ALLOWED', 'kids cannot read journal entries')
        const page = Number(ctx.query.get('page') ?? '0')
        const size = Number(ctx.query.get('size') ?? '50')
        if (!(page >= 0) || !(size >= 1 && size <= 200)) {
          throw problem.badRequest('INVALID_PAGING', 'page >= 0 and 1 <= size <= 200')
        }
        const newestFirst = [...h.entries].reverse()
        return { status: 200, body: newestFirst.slice(page * size, page * size + size) }
      }),

      // ---- approvals ---------------------------------------------------------------------------------

      r('GET', '/households/:h/approvals', (ctx) => {
        const h = hh(ctx)
        const me = member(h, ctx.uid)
        const status = ctx.query.get('status')
        const list = [...h.approvals]
          .filter((a) => me.role !== 'KID' || a.requestedByUid === ctx.uid)
          .map((a) => this.effective(a))
          .filter((a) => status === null || a.status === status)
          .reverse()
        return { status: 200, body: list }
      }),

      r('GET', '/households/:h/approvals/:a', (ctx) => {
        const h = hh(ctx)
        const me = member(h, ctx.uid)
        const a = this.findApproval(h, ctx.params.a ?? '')
        if (me.role === 'KID' && a.requestedByUid !== ctx.uid)
          throw problem.notFound('approval request')
        return { status: 200, body: this.effective(a) }
      }),

      r('POST', '/households/:h/approvals/:a/approve', (ctx) => {
        const h = hh(ctx)
        const me = member(h, ctx.uid)
        return this.idempotent(h.id, ctx, ['approve', ctx.uid, ctx.params.a], () => {
          if (!isTrusted(me.role)) {
            throw problem.forbidden('ROLE_NOT_ALLOWED', 'only an OWNER or APPROVER can approve')
          }
          const stored = this.findApproval(h, ctx.params.a ?? '')
          const a = this.effective(stored)
          if (a.requestedByUid === ctx.uid) {
            throw problem.forbidden('SELF_APPROVAL', 'you cannot approve your own request')
          }
          this.requireDecidable(a)
          const entry = postEntry(h, {
            id: this.nextId(),
            at: this.now(),
            kind: 'SPEND',
            description: a.description,
            reversesEntryId: null,
            approvalId: a.id,
            actorUid: ctx.uid,
            lines: [
              { accountId: a.fromAccountId, amount: -a.amountMinor },
              { accountId: a.toAccountId, amount: a.amountMinor },
            ],
          })
          Object.assign(stored, {
            status: 'APPROVED',
            decidedByUid: ctx.uid,
            decidedAt: this.now().toISOString(),
            entryId: entry.id,
          })
          return { status: 200, body: { ...stored } }
        })
      }),

      r('POST', '/households/:h/approvals/:a/reject', (ctx) => {
        const h = hh(ctx)
        const me = member(h, ctx.uid)
        const body = ctx.body === undefined ? {} : obj(ctx.body)
        const note = optStr(body.note, 500)
        return this.idempotent(h.id, ctx, ['reject', ctx.uid, ctx.params.a, note], () => {
          const stored = this.findApproval(h, ctx.params.a ?? '')
          const a = this.effective(stored)
          if (!isTrusted(me.role) && a.requestedByUid !== ctx.uid) {
            throw problem.forbidden(
              'ROLE_NOT_ALLOWED',
              'only an OWNER or APPROVER (or the requester) can reject',
            )
          }
          this.requireDecidable(a)
          Object.assign(stored, {
            status: 'REJECTED',
            decidedByUid: ctx.uid,
            decidedAt: this.now().toISOString(),
            decisionNote: note,
          })
          return { status: 200, body: { ...stored } }
        })
      }),

      // ---- allowances --------------------------------------------------------------------------------

      r('POST', '/households/:h/allowance-schedules', (ctx) => {
        const h = hh(ctx)
        requireRole(h, ctx.uid, 'OWNER')
        const body = obj(ctx.body)
        const fromId = optId(body.fromAccountId)
        const toId = str(body.toAccountId, 128)
        const amount = money(body.amountMinor)
        const frequency: Frequency =
          body.frequency === 'WEEKLY' || body.frequency === 'MONTHLY' ? body.frequency : invalid()
        const startDate =
          typeof body.startDate === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(body.startDate)
            ? body.startDate
            : invalid()
        const description = str(body.description, 200)
        const from = fromId === null ? accountByCode(h, POOL) : account(h, fromId)
        const to = account(h, toId)
        if (
          from.type !== 'ASSET' ||
          to.type !== 'ASSET' ||
          to.ownerUid === null ||
          from.currency !== to.currency ||
          from.id === to.id
        ) {
          throw problem.unprocessable(
            'INVALID_SCHEDULE',
            'an allowance moves money between two different asset accounts of one currency, into a member pot',
          )
        }
        if (startDate < this.now().toISOString().slice(0, 10)) {
          throw problem.badRequest(
            'START_IN_PAST',
            'startDate must not be in the past (missed periods are never back-paid)',
          )
        }
        const schedule: ScheduleView = {
          id: this.nextId(),
          fromAccountId: from.id,
          toAccountId: to.id,
          amountMinor: amount,
          currency: from.currency,
          frequency,
          startDate,
          nextDueOn: startDate,
          active: true,
          description,
        }
        h.schedules.push(schedule)
        return { status: 201, body: { ...schedule } }
      }),

      r('GET', '/households/:h/allowance-schedules', (ctx) => {
        const h = hh(ctx)
        requireRole(h, ctx.uid, 'OWNER', 'APPROVER')
        return { status: 200, body: h.schedules.map((s) => ({ ...s })) }
      }),

      r('GET', '/households/:h/allowance-schedules/:s/runs', (ctx) => {
        const h = hh(ctx)
        requireRole(h, ctx.uid, 'OWNER', 'APPROVER')
        const s = this.scheduleOf(h, ctx.params.s ?? '')
        const runs = [...(h.runs.get(s.id) ?? [])].sort((a, b) =>
          a.periodStart.localeCompare(b.periodStart),
        )
        return { status: 200, body: runs.map((run) => `${run.periodStart} ${run.status}`) }
      }),

      r('DELETE', '/households/:h/allowance-schedules/:s', (ctx) => {
        const h = hh(ctx)
        requireRole(h, ctx.uid, 'OWNER')
        this.scheduleOf(h, ctx.params.s ?? '').active = false
        return { status: 204 }
      }),

      // ---- reports -----------------------------------------------------------------------------------

      r('GET', '/households/:h/accounts/:a/statement', (ctx) => {
        const h = hh(ctx)
        const me = member(h, ctx.uid)
        const page = Number(ctx.query.get('page') ?? '0')
        const size = Number(ctx.query.get('size') ?? '50')
        if (!(page >= 0) || !(size >= 1 && size <= 500)) {
          throw problem.badRequest('INVALID_PAGING', 'page >= 0 and 1 <= size <= 500')
        }
        const a = this.visibleAccount(h, me, ctx.params.a ?? '')
        const filtered = filterRows(statementRows(h, a), ctx.query.get('from'), ctx.query.get('to'))
        return {
          status: 200,
          body: {
            accountId: a.id,
            code: a.code,
            currency: a.currency,
            type: a.type,
            page,
            size,
            totalRows: filtered.length,
            currentBalanceMinor: accountView(h, a).balanceMinor,
            rows: filtered.slice(page * size, page * size + size),
          },
        }
      }),

      r('GET', '/households/:h/accounts/:a/statement.csv', (ctx) => {
        const h = hh(ctx)
        const me = member(h, ctx.uid)
        const a = this.visibleAccount(h, me, ctx.params.a ?? '')
        const rows = filterRows(statementRows(h, a), ctx.query.get('from'), ctx.query.get('to'))
        return { status: 200, text: statementCsv(rows, a.currency) }
      }),

      r('GET', '/households/:h/reconciliation', (ctx) => {
        const h = hh(ctx)
        requireRole(h, ctx.uid, 'OWNER', 'APPROVER')
        return { status: 200, body: reconcile(h, this.now()) }
      }),
    ]
  }

  private visibleAccount(h: HouseholdRec, me: MemberView, id: string): AccountRec {
    const a = account(h, id)
    if (!canView(me, a)) throw problem.notFound('account')
    return a
  }

  private postUserEntry(
    h: HouseholdRec,
    kind: EntryView['kind'],
    description: string,
    actorUid: string,
    lines: Line[],
    reversesEntryId: string | null = null,
  ): EntryView {
    return postEntry(h, {
      id: this.nextId(),
      at: this.now(),
      kind,
      description,
      reversesEntryId,
      approvalId: null,
      actorUid,
      lines,
    })
  }
}
