import { FLAG_KEY_PATTERN, PRIVILEGED_ROLES } from '../lib/catalogue'
import type {
  AdminUser,
  AuditEntry,
  Flag,
  Identity,
  Page,
  SeriesPoint,
  ServiceUsage,
  TopUser,
  UsageSummary,
} from '../lib/types'
import { DEMO_PEOPLE, DEMO_ROLES, demoId, seedAudit, seedFlags } from './seed'

/**
 * In-memory stand-in for the two services the console calls (auth admin API and platform-service usage and flags),
 * speaking the real contract: same paths, status codes, problem documents and guardrails.
 *
 * Who is calling comes from the bearer token: `demo:<ROLE>[+<ROLE>][:<actor user number>]` (what the dev harness sends).
 * Any other token, or none, is treated as the first user, an OWNER. Calls the roles do not allow answer 403, so the
 * "not allowed" states can be seen.
 */
export interface DemoFetchOptions {
  now?: () => Date
}

const JSON_HEADERS = { 'content-type': 'application/json' }
const PROBLEM_HEADERS = { 'content-type': 'application/problem+json' }

const json = (body: unknown, status = 200): Response =>
  new Response(JSON.stringify(body), { status, headers: JSON_HEADERS })

const problem = (status: number, title: string, detail: string, code?: string): Response =>
  new Response(
    JSON.stringify({ type: 'about:blank', title, status, detail, ...(code ? { code } : {}) }),
    { status, headers: PROBLEM_HEADERS },
  )

const forbidden = () => problem(403, 'Forbidden', 'Access Denied')

interface StoredUser {
  id: string
  email: string
  displayName: string
  roles: Set<string>
  plan: string
  suspended: boolean
  permissionsVersion: number
}

/** Cheap deterministic hash in [0, 1). */
function noise(seed: number): number {
  let h = Math.imul(seed ^ 0x9e3779b9, 0x85ebca6b)
  h ^= h >>> 13
  h = Math.imul(h, 0xc2b2ae35)
  h ^= h >>> 16
  return (h >>> 0) / 4294967296
}

const SERVICES: readonly { name: string; weight: number; errorBias: number }[] = [
  { name: 'waiting-on', weight: 0.22, errorBias: 0.6 },
  { name: 'consent', weight: 0.14, errorBias: 0.5 },
  { name: 'home-pulse', weight: 0.27, errorBias: 1.4 },
  { name: 'ask-your-life', weight: 0.17, errorBias: 1.2 },
  { name: 'digital-legacy', weight: 0.06, errorBias: 0.4 },
  { name: 'family-treasury', weight: 0.14, errorBias: 0.8 },
]

const STEP = { '1m': 60_000, '1h': 3_600_000, '1d': 86_400_000 } as const

function resolutionFor(spanMs: number): keyof typeof STEP {
  if (spanMs <= 3 * 3_600_000) return '1m'
  if (spanMs <= 14 * 86_400_000) return '1h'
  return '1d'
}

/** Requests per hour for the whole platform at instant `t`: a daily curve (UTC afternoon peak) with weekday weighting. */
function platformRate(t: number): number {
  const hour = new Date(t).getUTCHours() + new Date(t).getUTCMinutes() / 60
  const daily = 0.35 + 0.65 * Math.max(0, Math.sin(((hour - 6) / 24) * 2 * Math.PI) * 0.5 + 0.5)
  const weekday = new Date(t).getUTCDay()
  const week = weekday === 0 || weekday === 6 ? 0.7 : 1
  return 520 * daily * week
}

function buildSeries(
  from: number,
  to: number,
  share = 1,
): { series: SeriesPoint[]; resolution: UsageSummary['resolution'] } {
  const resolution = resolutionFor(to - from)
  const step = STEP[resolution]
  const series: SeriesPoint[] = []
  for (let t = Math.floor(from / step) * step; t <= to; t += step) {
    const jitter = 0.75 + noise(t / 60_000) * 0.5
    const requests = Math.round(((platformRate(t) * step) / 3_600_000) * jitter * share)
    if (requests <= 0) continue
    // A rough patch now and then, so the error strip has something to show.
    const incident = noise(Math.floor(t / 3_600_000) * 7 + 3) > 0.93 ? 4.5 : 1
    const errors = Math.min(
      requests,
      Math.round(requests * 0.006 * incident * (0.5 + noise(t / 1000))),
    )
    series.push({ ts: new Date(t).toISOString(), requests, errors })
  }
  return { series, resolution }
}

function allocate(total: number, weights: readonly number[]): number[] {
  const sum = weights.reduce((a, b) => a + b, 0)
  const parts = weights.map((w) => Math.floor((total * w) / sum))
  parts[0] = (parts[0] ?? 0) + (total - parts.reduce((a, b) => a + b, 0))
  return parts
}

function summarise(from: number, to: number, share = 1, people = DEMO_PEOPLE.length): UsageSummary {
  const { series, resolution } = buildSeries(from, to, share)
  const totalRequests = series.reduce((a, p) => a + p.requests, 0)
  const errors = series.reduce((a, p) => a + p.errors, 0)
  const requestParts = allocate(
    totalRequests,
    SERVICES.map((s) => s.weight),
  )
  const errorParts = allocate(
    errors,
    SERVICES.map((s) => s.weight * s.errorBias),
  )
  const byService: ServiceUsage[] = SERVICES.map((s, i) => ({
    service: s.name,
    requests: requestParts[i] ?? 0,
    errors: Math.min(errorParts[i] ?? 0, requestParts[i] ?? 0),
  }))
  const clientErrors = Math.round(totalRequests * 0.021)
  const redirects = Math.round(totalRequests * 0.004)
  const byStatusClass: Record<string, number> = {}
  if (totalRequests > 0) {
    byStatusClass['2xx'] = Math.max(0, totalRequests - clientErrors - redirects - errors)
    if (redirects) byStatusClass['3xx'] = redirects
    if (clientErrors) byStatusClass['4xx'] = clientErrors
    if (errors) byStatusClass['5xx'] = errors
  }
  const spanHours = (to - from) / 3_600_000
  const activeUsers =
    totalRequests === 0
      ? 0
      : Math.max(1, Math.min(people, Math.round(people * Math.min(1, 0.25 + spanHours / 200))))
  return {
    totalRequests,
    errorRate: totalRequests ? errors / totalRequests : 0,
    p50Ms: totalRequests ? 34 + noise(from / 3_600_000) * 14 : null,
    p95Ms: totalRequests ? 180 + noise(to / 3_600_000) * 90 : null,
    activeUsers,
    byService,
    byStatusClass,
    series,
    from: new Date(from).toISOString(),
    to: new Date(to).toISOString(),
    resolution,
  }
}

const permissionsOf = (roles: Iterable<string>): string[] => {
  const all = new Set<string>()
  for (const role of roles)
    for (const p of DEMO_ROLES.find((r) => r.name === role)?.permissions ?? []) all.add(p)
  return [...all].sort()
}

export function createAdminDemoFetch(options: DemoFetchOptions = {}): typeof fetch {
  const clock = options.now ?? (() => new Date())
  const start = clock()

  const users = new Map<string, StoredUser>()
  for (const p of DEMO_PEOPLE) {
    users.set(demoId(p.n), {
      id: demoId(p.n),
      email: p.email,
      displayName: p.name,
      roles: new Set(p.roles),
      plan: p.plan,
      suspended: p.suspended ?? false,
      permissionsVersion: 1,
    })
  }
  const weights = new Map(DEMO_PEOPLE.map((p) => [demoId(p.n), p.weight]))
  const audit: AuditEntry[] = seedAudit(start)
  const flags = new Map<string, Flag>(seedFlags(start).map((f) => [f.key, f]))
  let auditCounter = 100

  const view = (u: StoredUser): AdminUser => ({
    id: u.id,
    email: u.email,
    displayName: u.displayName,
    roles: [...u.roles].sort(),
    permissions: permissionsOf(u.roles),
    plan: u.plan,
    suspended: u.suspended,
    permissionsVersion: u.permissionsVersion,
  })

  const record = (
    actor: string,
    action: string,
    target: string,
    detail: Record<string, unknown>,
  ) => {
    audit.unshift({
      id: `0190d2a4-aaaa-7c1b-9f2e-${String(++auditCounter).padStart(12, '0')}`,
      at: clock().toISOString(),
      actorId: actor,
      action,
      targetId: target,
      detail,
    })
  }

  function caller(headers: Headers): { id: string; permissions: Set<string> } {
    const token = (headers.get('authorization') ?? '').replace(/^Bearer\s+/i, '')
    const match = /^demo:([A-Z+]+)(?::(\d+))?$/.exec(token)
    const roles = match ? (match[1] ?? '').split('+') : ['OWNER']
    const actor = match?.[2] ? demoId(Number(match[2])) : demoId(1)
    return { id: actor, permissions: new Set(permissionsOf(roles)) }
  }

  const demoFetch = (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const request = input instanceof Request ? input : null
    const rawUrl =
      typeof input === 'string' ? input : input instanceof URL ? input.href : (request?.url ?? '')
    // `new URL` resolves the `../platform/` segments the console uses to reach the sibling service.
    const url = new URL(rawUrl, 'http://demo.local')
    const method = (init?.method ?? request?.method ?? 'GET').toUpperCase()
    const headers = new Headers(init?.headers ?? request?.headers)
    const bodyText = typeof init?.body === 'string' ? init.body : undefined
    const path = /\/v1\/.*$/.exec(url.pathname)?.[0] ?? url.pathname
    return Promise.resolve(handle(method, path, url.searchParams, headers, bodyText))
  }

  function handle(
    method: string,
    path: string,
    query: URLSearchParams,
    headers: Headers,
    bodyText: string | undefined,
  ): Response {
    const who = caller(headers)
    const can = (p: string) => who.permissions.has(p)
    const segments = path.split('/').filter(Boolean) // ['v1', ...]

    // ---------- auth: admin ----------
    if (path === '/v1/admin/roles' && method === 'GET') {
      return can('users:read') ? json(DEMO_ROLES) : forbidden()
    }

    if (path === '/v1/admin/users' && method === 'GET') {
      if (!can('users:read')) return forbidden()
      const paging = pagingOf(query)
      if (paging instanceof Response) return paging
      const q = (query.get('q') ?? '').trim().toLowerCase()
      const all = [...users.values()]
        .filter(
          (u) => !q || u.email.toLowerCase().includes(q) || u.displayName.toLowerCase().includes(q),
        )
        .reverse()
      return json(pageOf(all.map(view), paging.page, paging.size))
    }

    if (path === '/v1/admin/users/lookup' && method === 'GET') {
      if (!can('users:read')) return forbidden()
      const tokens = query
        .getAll('ids')
        .flatMap((v) => v.split(','))
        .map((v) => v.trim())
        .filter(Boolean)
      const wanted = new Set<string>()
      for (const t of tokens) {
        if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(t))
          return problem(
            400,
            'Bad Request',
            `'${t.slice(0, 40)}' is not a valid user id`,
            'INVALID_ID',
          )
        wanted.add(t.toLowerCase())
        if (wanted.size > 100)
          return problem(400, 'Bad Request', 'At most 100 ids per lookup', 'TOO_MANY_IDS')
      }
      if (wanted.size === 0)
        return problem(400, 'Bad Request', 'ids must list at least one user id', 'INVALID_ID')
      const found: Identity[] = [...wanted]
        .map((id) => users.get(id))
        .filter((u): u is StoredUser => u !== undefined)
        .map((u) => ({ id: u.id, email: u.email, displayName: u.displayName }))
      return json(found)
    }

    const userMatch =
      /^\/v1\/admin\/users\/([^/]+)(?:\/(roles|suspend|restore|plan)(?:\/([^/]+))?)?$/.exec(path)
    if (userMatch) {
      const [, id = '', action, arg] = userMatch
      const target = users.get(id)
      if (!action && method === 'GET') {
        if (!can('users:read')) return forbidden()
        return target
          ? json(view(target))
          : problem(404, 'Not Found', 'User not found', 'NOT_FOUND')
      }
      return mutateUser(who, can, method, target, action, arg ? decodeURIComponent(arg) : undefined)
    }

    // ---------- auth: audit ----------
    if (path === '/v1/admin/audit' && method === 'GET') {
      if (!can('audit:read')) return forbidden()
      const paging = pagingOf(query)
      if (paging instanceof Response) return paging
      const targetId = query.get('targetId')
      const items = audit.filter((e) => !targetId || e.targetId === targetId)
      return json(pageOf(items, paging.page, paging.size))
    }

    // ---------- platform: usage ----------
    if (segments[0] === 'v1' && segments[1] === 'usage' && method === 'GET') {
      const range = rangeOf(query, clock())
      if (range instanceof Response) return range
      if (path === '/v1/usage/summary') {
        if (!can('usage:read:all')) return forbidden()
        return json(summarise(range.from, range.to))
      }
      if (path === '/v1/usage/top-users') {
        if (!can('usage:read:all')) return forbidden()
        const limit = Number(query.get('limit') ?? 10)
        if (!Number.isInteger(limit) || limit < 1 || limit > 100)
          return problem(400, 'Bad Request', 'limit must be between 1 and 100')
        const total = summarise(range.from, range.to)
        const sumW = [...weights.values()].reduce((a, b) => a + b, 0)
        const top: TopUser[] = [...users.values()]
          .map((u) => {
            const share = (weights.get(u.id) ?? 1) / sumW
            const requests = u.suspended ? 0 : Math.round(total.totalRequests * share)
            return {
              principalType: 'USER',
              principalId: u.id,
              requests,
              errors: Math.round(requests * (0.003 + noise(Number(u.id.slice(-4))) * 0.01)),
            }
          })
          .filter((t) => t.requests > 0)
          .sort((a, b) => b.requests - a.requests)
          .slice(0, limit)
        return json(top)
      }
      if (path === '/v1/usage/me') {
        if (!can('usage:read:self') && !can('usage:read:all')) return forbidden()
        const sumW = [...weights.values()].reduce((a, b) => a + b, 0)
        const share = (weights.get(who.id) ?? 1) / sumW
        const mine = summarise(range.from, range.to, share, 1)
        mine.activeUsers = mine.totalRequests > 0 ? 1 : 0
        return json(mine)
      }
    }

    // ---------- platform: flags ----------
    if (path === '/v1/flags/evaluate' && method === 'GET') {
      const result: Record<string, boolean> = {}
      for (const f of [...flags.values()].sort((a, b) => a.key.localeCompare(b.key))) {
        result[f.key] =
          f.enabled && noise(Number(who.id.slice(-4)) + f.key.length) * 100 < f.rolloutPercent
      }
      return json({ flags: result })
    }
    const flagMatch = /^\/v1\/flags(?:\/([^/]+))?$/.exec(path)
    if (flagMatch) {
      if (!can('flags:manage')) return forbidden()
      const key = flagMatch[1] ? decodeURIComponent(flagMatch[1]) : undefined
      return handleFlags(method, key, bodyText, who.id)
    }

    return problem(404, 'Not Found', `No demo route for ${method} ${path}`)
  }

  function mutateUser(
    who: { id: string; permissions: Set<string> },
    can: (p: string) => boolean,
    method: string,
    target: StoredUser | undefined,
    action: string | undefined,
    arg: string | undefined,
  ): Response {
    const needs =
      action === 'roles'
        ? 'roles:assign'
        : action === 'plan'
          ? 'plans:manage'
          : action
            ? 'users:write'
            : ''
    if (!needs || !can(needs))
      return needs ? forbidden() : problem(405, 'Method Not Allowed', 'Not allowed')
    if (!target) return problem(404, 'Not Found', 'User not found', 'NOT_FOUND')
    const privilegedActor = can('roles:assign:privileged')
    const privilegedMessage =
      'Only an OWNER can grant or revoke ADMIN or OWNER, or change an ADMIN or OWNER'
    const holdsPrivileged = [...target.roles].some((r) => PRIVILEGED_ROLES.includes(r))
    const otherActiveOwner = () =>
      [...users.values()].some((u) => u.id !== target.id && u.roles.has('OWNER') && !u.suspended)
    const bump = () => {
      target.permissionsVersion += 1
    }

    if (action === 'roles' && arg) {
      if (!DEMO_ROLES.some((r) => r.name === arg))
        return problem(404, 'Not Found', 'Role not found', 'NOT_FOUND')
      if (method === 'PUT') {
        if ((PRIVILEGED_ROLES.includes(arg) || holdsPrivileged) && !privilegedActor)
          return problem(403, 'Forbidden', privilegedMessage, 'PRIVILEGED_ROLE_REQUIRED')
        if (!target.roles.has(arg)) {
          target.roles.add(arg)
          bump()
          record(who.id, 'ROLE_GRANTED', target.id, { role: arg })
        }
        return json(view(target))
      }
      if (method === 'DELETE') {
        if (arg === 'MEMBER')
          return problem(
            400,
            'Bad Request',
            'The MEMBER role is held by everyone and cannot be revoked',
            'BASELINE_ROLE',
          )
        if ((PRIVILEGED_ROLES.includes(arg) || holdsPrivileged) && !privilegedActor)
          return problem(403, 'Forbidden', privilegedMessage, 'PRIVILEGED_ROLE_REQUIRED')
        if (
          arg === 'OWNER' &&
          target.roles.has('OWNER') &&
          !target.suspended &&
          !otherActiveOwner()
        )
          return problem(
            409,
            'Conflict',
            'The last active OWNER cannot be removed or suspended',
            'LAST_OWNER',
          )
        if (target.roles.delete(arg)) {
          bump()
          record(who.id, 'ROLE_REVOKED', target.id, { role: arg })
        }
        return json(view(target))
      }
    }
    if (action === 'suspend' && method === 'POST') {
      if (holdsPrivileged && !privilegedActor)
        return problem(403, 'Forbidden', privilegedMessage, 'PRIVILEGED_ROLE_REQUIRED')
      if (target.roles.has('OWNER') && !target.suspended && !otherActiveOwner())
        return problem(
          409,
          'Conflict',
          'The last active OWNER cannot be removed or suspended',
          'LAST_OWNER',
        )
      if (target.id === who.id)
        return problem(400, 'Bad Request', 'You cannot suspend your own account', 'SELF_SUSPEND')
      if (!target.suspended) {
        target.suspended = true
        bump()
        record(who.id, 'USER_SUSPENDED', target.id, {})
      }
      return json(view(target))
    }
    if (action === 'restore' && method === 'POST') {
      if (holdsPrivileged && !privilegedActor)
        return problem(403, 'Forbidden', privilegedMessage, 'PRIVILEGED_ROLE_REQUIRED')
      if (target.suspended) {
        target.suspended = false
        bump()
        record(who.id, 'USER_RESTORED', target.id, {})
      }
      return json(view(target))
    }
    if (action === 'plan' && method === 'PUT' && arg) {
      if (!['FREE', 'PRO', 'DEVELOPER'].includes(arg))
        return problem(
          400,
          'Bad Request',
          'Plan must be one of FREE, PRO, DEVELOPER',
          'INVALID_PLAN',
        )
      if (arg !== target.plan) {
        const from = target.plan
        target.plan = arg
        bump()
        record(who.id, 'PLAN_CHANGED', target.id, { from, to: arg })
      }
      return json(view(target))
    }
    return problem(405, 'Method Not Allowed', 'Not allowed')
  }

  function handleFlags(
    method: string,
    key: string | undefined,
    bodyText: string | undefined,
    actor: string,
  ): Response {
    const now = clock().toISOString()
    if (method === 'GET' && !key)
      return json([...flags.values()].sort((a, b) => a.key.localeCompare(b.key)))
    let body: Record<string, unknown> = {}
    try {
      body = bodyText ? (JSON.parse(bodyText) as Record<string, unknown>) : {}
    } catch {
      return problem(400, 'Bad Request', 'Malformed JSON request body')
    }
    const names = (v: unknown): string[] | Response => {
      if (v === undefined || v === null) return []
      if (
        !Array.isArray(v) ||
        v.some((x) => typeof x !== 'string' || !/^[A-Z][A-Z0-9_]{0,31}$/.test(x))
      )
        return problem(
          400,
          'Bad Request',
          'allowedPlans/allowedRoles must be upper case names such as PRO',
        )
      return [...new Set(v as string[])]
    }
    const build = (k: string): Flag | Response => {
      const rollout = body.rolloutPercent === undefined ? 100 : body.rolloutPercent
      if (typeof rollout !== 'number' || !Number.isInteger(rollout) || rollout < 0 || rollout > 100)
        return problem(400, 'Bad Request', 'rolloutPercent must be between 0 and 100')
      const description = typeof body.description === 'string' ? body.description : ''
      if (description.length > 500)
        return problem(400, 'Bad Request', 'description must be at most 500 characters')
      const plans = names(body.allowedPlans)
      if (plans instanceof Response) return plans
      const roles = names(body.allowedRoles)
      if (roles instanceof Response) return roles
      return {
        key: k,
        description,
        enabled: body.enabled === true,
        rolloutPercent: rollout,
        allowedPlans: plans,
        allowedRoles: roles,
        updatedAt: now,
        updatedBy: actor,
      }
    }

    if (method === 'POST' && !key) {
      const k = body.key
      if (typeof k !== 'string' || k === '') return problem(400, 'Bad Request', 'key is required')
      if (!FLAG_KEY_PATTERN.test(k))
        return problem(
          400,
          'Bad Request',
          "key must be 1-64 characters of a-z, 0-9, '.', '_' or '-', starting with a letter or digit",
        )
      if (flags.has(k)) return problem(409, 'Conflict', `A flag with key '${k}' already exists`)
      const flag = build(k)
      if (flag instanceof Response) return flag
      const created = { ...flag, createdAt: now }
      flags.set(k, created)
      return json(created, 201)
    }
    if (key && method === 'PUT') {
      const existing = flags.get(key)
      if (!existing) return problem(404, 'Not Found', `No flag with key '${key}'`)
      if (typeof body.key === 'string' && body.key !== key)
        return problem(400, 'Bad Request', 'key in the body does not match the path')
      const flag = build(key)
      if (flag instanceof Response) return flag
      const updated = { ...flag, createdAt: existing.createdAt ?? now }
      flags.set(key, updated)
      return json(updated)
    }
    if (key && method === 'DELETE') {
      if (!flags.delete(key)) return problem(404, 'Not Found', `No flag with key '${key}'`)
      return new Response(null, { status: 204 })
    }
    return problem(405, 'Method Not Allowed', 'Not allowed')
  }

  return demoFetch
}

function pagingOf(query: URLSearchParams): { page: number; size: number } | Response {
  const page = Number(query.get('page') ?? 0)
  const size = Number(query.get('size') ?? 20)
  if (!Number.isInteger(page) || page < 0)
    return problem(400, 'Bad Request', 'page must be 0 or greater', 'INVALID_PAGING')
  if (!Number.isInteger(size) || size < 1 || size > 100)
    return problem(400, 'Bad Request', 'size must be between 1 and 100', 'INVALID_PAGING')
  return { page, size }
}

function pageOf<T>(all: T[], page: number, size: number): Page<T> {
  return { items: all.slice(page * size, page * size + size), page, size, total: all.length }
}

function rangeOf(query: URLSearchParams, now: Date): { from: number; to: number } | Response {
  const to = query.get('to') ? Date.parse(query.get('to') ?? '') : now.getTime()
  const from = query.get('from') ? Date.parse(query.get('from') ?? '') : to - 24 * 3_600_000
  if (!Number.isFinite(to) || !Number.isFinite(from))
    return problem(400, 'Bad Request', 'from and to must be ISO-8601 instants')
  if (from >= to) return problem(400, 'Bad Request', "'from' must be before 'to'")
  if (to - from > 366 * 86_400_000)
    return problem(400, 'Bad Request', 'The range must not exceed 366 days')
  return { from, to }
}
