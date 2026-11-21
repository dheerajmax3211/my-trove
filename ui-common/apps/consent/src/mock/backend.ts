import {
  SENSITIVITIES,
  type AccessRequest,
  type AllowedHours,
  type ApproveBody,
  type Attribute,
  type AuditEntry,
  type Client,
  type ClientWithSecret,
  type Dashboard,
  type Grant,
  type GrantStatus,
  type Sensitivity,
} from '../shared/api/types'
import { isValidKeyPath, pathCovers, scopeCoversPath, parseScope } from '../shared/lib/scopes'
import { AuditChain, chainHash, type TamperKind } from './chain'
import {
  HttpProblem,
  badRequest,
  conflict,
  json,
  noContent,
  notFound,
  problem,
  unreadable,
  validationFailed,
} from './http'

const OWNER_UID = 'demo-user'
const REQUEST_TTL_MS = 7 * 86_400_000
const MAX_GRANT_SECONDS = 365 * 86_400
const MAX_VALUE_CHARS = 64 * 1024
const MAX_PENDING_PER_CLIENT = 50

export interface MockBackendOptions {
  /** Epoch milliseconds. Default: the real clock. */
  now?: () => number
  /** Simulated network latency per request. Default 0. */
  latencyMs?: number
  /** `demo` loads a believable vault, clients, requests and history; `empty` starts blank. */
  seed?: 'demo' | 'empty'
}

export interface RecordedCall {
  method: string
  path: string
  query: Record<string, string>
  body: unknown
}

export interface NewAccessRequest {
  clientId: string
  scopes: string[]
  purpose: string
  durationSeconds: number
  maxReads?: number | null
  allowedHours?: AllowedHours | null
}

interface ClientRow {
  client: Client
  /** The plaintext secret is kept only so the mock can mimic "shown once"; no endpoint returns it again. */
  secret: string
}

interface RequestRow {
  id: string
  clientId: string
  scopes: string[]
  purpose: string
  durationSeconds: number
  maxReads: number | null
  allowedHours: AllowedHours | null
  status: 'PENDING' | 'APPROVED' | 'DENIED'
  createdAt: string
  decidedAt: string | null
  decisionNote: string | null
}

type GrantRow = Omit<Grant, 'status'> & { requestId: string }

interface Failure {
  matcher: RegExp
  response: () => Response
  remaining: number
}

type Handler = (ctx: Context) => Response

interface Context {
  params: string[]
  query: URLSearchParams
  body: unknown
  path: string
}

export interface MockBackend {
  fetch: typeof fetch
  /** Every request the app made, in order. */
  calls: RecordedCall[]
  /** Pretend the network is down (fetch rejects) until switched off again. */
  setOffline: (offline: boolean) => void
  /** Answer the next `times` requests matching `"METHOD /path"` with this problem. */
  failNext: (matcher: RegExp, status: number, detail?: string, times?: number) => void
  /** What a third-party app would do: ask for access. The owner sees it in the inbox. */
  simulateAccessRequest: (input?: Partial<NewAccessRequest>) => AccessRequest
  /** What a third-party app would do: read data through a grant. Appears in the audit log. */
  simulateRead: (grantId?: string, path?: string) => AuditEntry
  /** Corrupt the stored audit log so the next verification fails. */
  tamperAudit: (kind: TamperKind, seq?: number) => void
  /** The secret currently stored for a client (test assertions only). */
  secretOf: (clientId: string) => string | undefined
}

const SCRIPTED_REQUESTS: Omit<NewAccessRequest, 'clientId'>[] = [
  {
    scopes: ['profile.sizes:read', 'profile.name:read'],
    purpose: 'Recommend shoes and jackets that fit',
    durationSeconds: 7 * 86_400,
    maxReads: 20,
  },
  {
    scopes: ['health.allergies:read', 'preferences.diet:read'],
    purpose: 'Plan weekly menus that are safe for you',
    durationSeconds: 30 * 86_400,
    maxReads: null,
  },
  {
    scopes: ['addresses.home:read'],
    purpose: 'Pre-fill delivery details at checkout',
    durationSeconds: 86_400,
    maxReads: 3,
  },
]

const uuid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`
const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v)

function canonicalScopes(scopes: unknown): string[] {
  if (!Array.isArray(scopes) || scopes.length === 0)
    throw badRequest('at least one scope is required')
  const result = new Set<string>()
  for (const raw of scopes) {
    const scope = String(raw).trim()
    if (!parseScope(scope)) {
      throw badRequest(`Scope must look like 'path:read': '${scope.slice(0, 40)}'`)
    }
    result.add(scope)
  }
  return [...result].sort()
}

export function createMockBackend(options: MockBackendOptions = {}): MockBackend {
  const clock = options.now ?? (() => Date.now())
  const latencyMs = options.latencyMs ?? 0
  let timeOverride: number | null = null
  const nowMs = () => timeOverride ?? clock()
  const now = () => new Date(nowMs())
  const iso = () => now().toISOString()

  const attributes = new Map<string, Attribute>()
  const clients = new Map<string, ClientRow>()
  const requests: RequestRow[] = []
  const grants: GrantRow[] = []
  const audit = new AuditChain(OWNER_UID)
  const calls: RecordedCall[] = []
  const failures: Failure[] = []
  let offline = false
  const seq = { client: 0, request: 0, grant: 0, secret: 0 }

  // ---- shared pieces ----

  const log = (
    type: AuditEntry['eventType'],
    actor: { type: 'OWNER' | 'CLIENT'; id: string },
    clientId: string | null,
    grantId: string | null,
    detail: Record<string, unknown>,
  ) => audit.append(now(), type, actor.type, actor.id, clientId, grantId, detail)
  const owner = { type: 'OWNER', id: OWNER_UID } as const

  const requestExpired = (r: RequestRow) =>
    r.status === 'PENDING' && nowMs() >= Date.parse(r.createdAt) + REQUEST_TTL_MS

  const grantStatus = (g: GrantRow): GrantStatus => {
    if (g.revokedAt !== null && Date.parse(g.revokedAt) <= nowMs()) return 'REVOKED'
    return nowMs() < Date.parse(g.expiresAt) ? 'ACTIVE' : 'EXPIRED'
  }
  const grantView = (g: GrantRow): Grant => {
    const { requestId: _requestId, ...rest } = g
    return { ...rest, status: grantStatus(g) }
  }
  const clientName = (clientId: string) => clients.get(clientId)?.client.name ?? clientId
  const requestView = (r: RequestRow): AccessRequest => ({
    id: r.id,
    clientId: r.clientId,
    clientName: clientName(r.clientId),
    scopes: r.scopes,
    purpose: r.purpose,
    durationSeconds: r.durationSeconds,
    maxReads: r.maxReads,
    allowedHours: r.allowedHours,
    status: requestExpired(r) ? 'EXPIRED' : r.status,
    createdAt: r.createdAt,
    decidedAt: r.decidedAt,
    decisionNote: r.decisionNote,
    grantId: grants.find((g) => g.requestId === r.id)?.id ?? null,
  })
  const listGrants = (includeInactive: boolean) =>
    grants
      .filter((g) => includeInactive || grantStatus(g) === 'ACTIVE')
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt) || b.id.localeCompare(a.id))
      .map(grantView)

  // ---- operations shared by routes, seeding and simulations ----

  function createAttribute(keyPath: string, value: unknown, sensitivity: Sensitivity): Attribute {
    if (!isValidKeyPath(keyPath)) {
      throw badRequest(
        'keyPath must be dot-separated segments of [a-z0-9_] (e.g. profile.sizes.shoe), max 255 chars',
      )
    }
    if (value === null || value === undefined)
      throw badRequest('value must be present and not null')
    if (JSON.stringify(value).length > MAX_VALUE_CHARS) {
      throw badRequest(`value is larger than ${MAX_VALUE_CHARS} characters`)
    }
    if (attributes.has(keyPath))
      throw conflict('ATTRIBUTE_EXISTS', `Attribute already exists: ${keyPath}`)
    const at = iso()
    const attribute: Attribute = { keyPath, value, sensitivity, createdAt: at, updatedAt: at }
    attributes.set(keyPath, attribute)
    log('VAULT_ATTRIBUTE_CREATED', owner, null, null, { keyPath, sensitivity })
    return attribute
  }

  function registerClient(
    name: string,
    contactEmail: string | null,
    scopes: string[],
  ): ClientWithSecret {
    seq.client += 1
    seq.secret += 1
    const clientId = `cl_${chainHash([seq.client]).slice(0, 22)}`
    const secret = `cs_${chainHash([seq.secret, 'secret']).slice(0, 43)}`
    const client: Client = {
      clientId,
      name: name.trim(),
      contactEmail,
      redirectUri: null,
      allowedScopes: scopes,
      createdAt: iso(),
      secretRotatedAt: null,
      disabledAt: null,
    }
    clients.set(clientId, { client, secret })
    log('CLIENT_REGISTERED', owner, clientId, null, { name: client.name, allowedScopes: scopes })
    return { client, clientSecret: secret }
  }

  function createRequest(input: NewAccessRequest): RequestRow {
    const row = clients.get(input.clientId)
    if (!row) throw notFound('Client')
    const scopes = canonicalScopes(input.scopes)
    for (const scope of scopes) {
      const wanted = parseScope(scope)
      const allowed = row.client.allowedScopes.some((a) => {
        const parsed = parseScope(a)
        return parsed !== null && wanted !== null && pathCovers(parsed.path, wanted.path)
      })
      if (!allowed) {
        throw new HttpProblem(
          403,
          'SCOPE_NOT_ALLOWED_FOR_CLIENT',
          `Client is not registered for scope ${scope}`,
        )
      }
    }
    if (input.durationSeconds < 60 || input.durationSeconds > MAX_GRANT_SECONDS) {
      throw badRequest(`durationSeconds must be between 60 and ${MAX_GRANT_SECONDS}`)
    }
    if (
      requests.filter((r) => r.clientId === input.clientId && r.status === 'PENDING').length >=
      MAX_PENDING_PER_CLIENT
    ) {
      throw new HttpProblem(
        429,
        'TOO_MANY_PENDING_REQUESTS',
        'Too many pending requests; wait for the owner to decide',
      )
    }
    seq.request += 1
    const request: RequestRow = {
      id: uuid(1000 + seq.request),
      clientId: input.clientId,
      scopes,
      purpose: input.purpose.trim(),
      durationSeconds: input.durationSeconds,
      maxReads: input.maxReads ?? null,
      allowedHours: input.allowedHours ?? null,
      status: 'PENDING',
      createdAt: iso(),
      decidedAt: null,
      decisionNote: null,
    }
    requests.unshift(request)
    log('ACCESS_REQUESTED', { type: 'CLIENT', id: input.clientId }, input.clientId, null, {
      requestId: request.id,
      scopes,
      purpose: request.purpose,
      durationSeconds: request.durationSeconds,
    })
    return request
  }

  function approve(id: string, body: ApproveBody): GrantRow {
    const request = requests.find((r) => r.id === id)
    if (!request) throw notFound('Request')
    if (request.status !== 'PENDING') {
      throw conflict('REQUEST_ALREADY_DECIDED', `Request was already ${request.status}`)
    }
    if (requestExpired(request))
      throw conflict('REQUEST_EXPIRED', 'Request expired before it was decided')
    if (clients.get(request.clientId)?.client.disabledAt)
      throw conflict('CLIENT_DISABLED', 'Client is disabled')

    let scopes = request.scopes
    if (body.scopes !== undefined) {
      scopes = canonicalScopes(body.scopes)
      for (const scope of scopes) {
        const narrowed = parseScope(scope)
        const covered = request.scopes.some((r) => {
          const wanted = parseScope(r)
          return wanted !== null && narrowed !== null && pathCovers(wanted.path, narrowed.path)
        })
        if (!covered) {
          throw badRequest(
            `Scope ${scope} is broader than what was requested; approval can only narrow`,
          )
        }
      }
    }
    let duration = request.durationSeconds
    if (body.durationSeconds !== undefined) {
      if (body.durationSeconds < 60 || body.durationSeconds > request.durationSeconds) {
        throw badRequest(
          `durationSeconds must be between 60 and the requested ${request.durationSeconds}`,
        )
      }
      duration = body.durationSeconds
    }
    let maxReads = request.maxReads
    if (body.maxReads !== undefined) {
      if (body.maxReads < 1 || (request.maxReads !== null && body.maxReads > request.maxReads)) {
        throw badRequest('maxReads must be at least 1 and not above the requested value')
      }
      maxReads = body.maxReads
    }
    const ceiling = body.maxSensitivity ?? 'SENSITIVE'

    request.status = 'APPROVED'
    request.decidedAt = iso()
    seq.grant += 1
    const grant: GrantRow = {
      id: uuid(2000 + seq.grant),
      requestId: request.id,
      clientId: request.clientId,
      clientName: clientName(request.clientId),
      scopes,
      purpose: request.purpose,
      maxSensitivity: ceiling,
      createdAt: iso(),
      expiresAt: new Date(nowMs() + duration * 1000).toISOString(),
      maxReads,
      readsUsed: 0,
      allowedHours: request.allowedHours,
      revokedAt: null,
      lastReadAt: null,
    }
    grants.push(grant)
    log('REQUEST_APPROVED', owner, request.clientId, grant.id, {
      requestId: request.id,
      scopes,
      narrowed: scopes.join() !== request.scopes.join() || duration !== request.durationSeconds,
      expiresAt: grant.expiresAt,
      maxReads,
      maxSensitivity: ceiling,
    })
    return grant
  }

  function deny(id: string, note: string | null): RequestRow {
    const request = requests.find((r) => r.id === id)
    if (!request) throw notFound('Request')
    if (request.status !== 'PENDING') {
      throw conflict('REQUEST_ALREADY_DECIDED', `Request was already ${request.status}`)
    }
    request.status = 'DENIED'
    request.decidedAt = iso()
    request.decisionNote = note
    log('REQUEST_DENIED', owner, request.clientId, null, { requestId: request.id })
    return request
  }

  function revoke(grant: GrantRow, cause: 'OWNER' | 'CLIENT_DISABLED'): void {
    if (grant.revokedAt !== null) return
    grant.revokedAt = iso()
    log('GRANT_REVOKED', owner, grant.clientId, grant.id, { cause })
  }

  function simulateRead(grantId?: string, path?: string): AuditEntry {
    const grant = grantId
      ? grants.find((g) => g.id === grantId)
      : grants.find((g) => grantStatus(g) === 'ACTIVE')
    if (!grant) throw new Error('simulateRead: there is no grant to read through')
    const actor = { type: 'CLIENT', id: grant.clientId } as const
    const deny = (reason: string) =>
      log('DATA_DENIED', actor, grant.clientId, grant.id, {
        decision: 'DENY',
        reason,
        path: path ?? null,
      })
    const status = grantStatus(grant)
    if (status === 'REVOKED') return deny('GRANT_REVOKED')
    if (status === 'EXPIRED') return deny('GRANT_EXPIRED')
    if (grant.maxReads !== null && grant.readsUsed >= grant.maxReads)
      return deny('MAX_READS_EXHAUSTED')
    if (
      path &&
      !grant.scopes.some(
        (s) => scopeCoversPath(s, path) || pathCovers(path, parseScope(s)?.path ?? ''),
      )
    ) {
      return deny('SCOPE_NOT_GRANTED')
    }
    const rank = (s: Sensitivity) => SENSITIVITIES.indexOf(s)
    const inScope = [...attributes.values()].filter(
      (a) =>
        grant.scopes.some((s) => scopeCoversPath(s, a.keyPath)) &&
        (!path || pathCovers(path, a.keyPath)),
    )
    const released = inScope.filter((a) => rank(a.sensitivity) <= rank(grant.maxSensitivity))
    grant.readsUsed += 1
    grant.lastReadAt = iso()
    return log('DATA_READ', actor, grant.clientId, grant.id, {
      decision: 'ALLOW',
      path: path ?? null,
      keys: released.map((a) => a.keyPath),
      withheldBySensitivity: inScope.length - released.length,
      readsUsed: grant.readsUsed,
    })
  }

  // ---- request parsing and validation ----

  const bodyOf = (init: RequestInit | undefined): unknown => {
    if (typeof init?.body !== 'string' || init.body === '') return undefined
    try {
      return JSON.parse(init.body) as unknown
    } catch {
      throw unreadable()
    }
  }
  const requireBody = (body: unknown): Record<string, unknown> => {
    if (!isRecord(body)) throw unreadable()
    return body
  }
  const sensitivityOf = (v: unknown, errors: Record<string, string>): Sensitivity | null => {
    if (v === undefined || v === null) {
      errors.sensitivity = 'must not be null'
      return null
    }
    if (typeof v !== 'string' || !SENSITIVITIES.includes(v as Sensitivity)) throw unreadable()
    return v as Sensitivity
  }
  const intField = (
    b: Record<string, unknown>,
    name: string,
    min: number,
    max: number | null,
    errors: Record<string, string>,
  ) => {
    const v = b[name]
    if (v === undefined || v === null) return undefined
    if (typeof v !== 'number' || !Number.isInteger(v)) throw unreadable()
    if (v < min) errors[name] = `must be greater than or equal to ${min}`
    else if (max !== null && v > max) errors[name] = `must be less than or equal to ${max}`
    return v
  }

  // ---- routes ----

  const routes: { method: string; pattern: RegExp; handler: Handler }[] = []
  const route = (method: string, pattern: string, handler: Handler) =>
    routes.push({ method, pattern: new RegExp(`^${pattern}$`), handler })
  const ID = '([^/]+)'
  const O = '/v1/owner'

  route('POST', `${O}/vault/attributes`, ({ body }) => {
    const b = requireBody(body)
    const errors: Record<string, string> = {}
    const keyPath = typeof b.keyPath === 'string' ? b.keyPath : undefined
    if (b.keyPath !== undefined && b.keyPath !== null && keyPath === undefined) throw unreadable()
    if (!keyPath?.trim()) errors.keyPath = 'must not be blank'
    else if (keyPath.length > 255) errors.keyPath = 'size must be between 0 and 255'
    if (b.value === undefined) errors.value = 'must not be null'
    const sensitivity = sensitivityOf(b.sensitivity, errors)
    if (Object.keys(errors).length > 0) throw validationFailed(errors)
    return json(createAttribute(keyPath ?? '', b.value, sensitivity ?? 'PERSONAL'), 201)
  })
  route('GET', `${O}/vault/attributes`, ({ query }) => {
    const prefix = query.get('prefix')
    if (prefix && !isValidKeyPath(prefix))
      throw badRequest(
        'keyPath must be dot-separated segments of [a-z0-9_] (e.g. profile.sizes.shoe), max 255 chars',
      )
    return json(
      [...attributes.values()]
        .filter((a) => !prefix || pathCovers(prefix, a.keyPath))
        .sort((a, b) => a.keyPath.localeCompare(b.keyPath)),
    )
  })
  route('GET', `${O}/vault/attributes/${ID}`, ({ params }) => {
    const found = attributes.get(decodeURIComponent(params[0] ?? ''))
    if (!found) throw notFound(`Attribute ${params[0] ?? ''}`)
    return json(found)
  })
  route('PUT', `${O}/vault/attributes/${ID}`, ({ params, body }) => {
    const keyPath = decodeURIComponent(params[0] ?? '')
    const b = requireBody(body)
    const errors: Record<string, string> = {}
    if (b.value === undefined) errors.value = 'must not be null'
    const sensitivity = sensitivityOf(b.sensitivity, errors)
    if (Object.keys(errors).length > 0) throw validationFailed(errors)
    if (b.value === null) throw badRequest('value must be present and not null')
    if (JSON.stringify(b.value).length > MAX_VALUE_CHARS)
      throw badRequest(`value is larger than ${MAX_VALUE_CHARS} characters`)
    const existing = attributes.get(keyPath)
    if (!existing) throw notFound(`Attribute ${keyPath}`)
    const updated: Attribute = {
      ...existing,
      value: b.value,
      sensitivity: sensitivity ?? existing.sensitivity,
      updatedAt: iso(),
    }
    attributes.set(keyPath, updated)
    log('VAULT_ATTRIBUTE_UPDATED', owner, null, null, { keyPath, sensitivity: updated.sensitivity })
    return json(updated)
  })
  route('DELETE', `${O}/vault/attributes/${ID}`, ({ params }) => {
    const keyPath = decodeURIComponent(params[0] ?? '')
    if (!attributes.delete(keyPath)) throw notFound(`Attribute ${keyPath}`)
    log('VAULT_ATTRIBUTE_DELETED', owner, null, null, { keyPath })
    return noContent()
  })

  route('POST', `${O}/clients`, ({ body }) => {
    const b = requireBody(body)
    const errors: Record<string, string> = {}
    const name = typeof b.name === 'string' ? b.name : ''
    if (!name.trim()) errors.name = 'must not be blank'
    else if (name.length > 120) errors.name = 'size must be between 0 and 120'
    const email = typeof b.contactEmail === 'string' ? b.contactEmail : null
    if (email !== null && email !== '' && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
      errors.contactEmail = 'must be a well-formed email address'
    }
    if (!Array.isArray(b.allowedScopes) || b.allowedScopes.length === 0)
      errors.allowedScopes = 'must not be empty'
    if (Object.keys(errors).length > 0) throw validationFailed(errors)
    const created = registerClient(
      name,
      email?.trim() ? email.trim() : null,
      canonicalScopes(b.allowedScopes),
    )
    return new Response(JSON.stringify(created), {
      status: 201,
      headers: { 'content-type': 'application/json', 'cache-control': 'no-store' },
    })
  })
  route('GET', `${O}/clients`, () =>
    json(
      [...clients.values()]
        .map((c) => c.client)
        .sort(
          (a, b) => b.createdAt.localeCompare(a.createdAt) || b.clientId.localeCompare(a.clientId),
        ),
    ),
  )
  route('GET', `${O}/clients/${ID}`, ({ params }) => {
    const row = clients.get(params[0] ?? '')
    if (!row) throw notFound('Client')
    return json(row.client)
  })
  route('POST', `${O}/clients/${ID}/rotate-secret`, ({ params }) => {
    const row = clients.get(params[0] ?? '')
    if (!row) throw notFound('Client')
    if (row.client.disabledAt) throw conflict('CLIENT_DISABLED', 'Client is disabled')
    seq.secret += 1
    row.secret = `cs_${chainHash([seq.secret, 'secret']).slice(0, 43)}`
    row.client = { ...row.client, secretRotatedAt: iso() }
    log('CLIENT_SECRET_ROTATED', owner, row.client.clientId, null, {})
    return new Response(JSON.stringify({ client: row.client, clientSecret: row.secret }), {
      status: 200,
      headers: { 'content-type': 'application/json', 'cache-control': 'no-store' },
    })
  })
  route('DELETE', `${O}/clients/${ID}`, ({ params }) => {
    const row = clients.get(params[0] ?? '')
    if (!row) throw notFound('Client')
    if (row.client.disabledAt) return noContent()
    row.client = { ...row.client, disabledAt: iso() }
    const open = grants.filter((g) => g.clientId === row.client.clientId && g.revokedAt === null)
    log('CLIENT_DISABLED', owner, row.client.clientId, null, { grantsRevoked: open.length })
    for (const grant of open) revoke(grant, 'CLIENT_DISABLED')
    return noContent()
  })

  route('GET', `${O}/requests`, ({ query }) => {
    const status = query.get('status')
    if (status && !['PENDING', 'APPROVED', 'DENIED'].includes(status)) {
      throw badRequest('status must be PENDING, APPROVED or DENIED')
    }
    return json(
      requests
        .filter((r) => !status || r.status === status)
        .slice(0, 200)
        .map(requestView),
    )
  })
  route('GET', `${O}/requests/${ID}`, ({ params }) => {
    const found = requests.find((r) => r.id === params[0])
    if (!found) throw notFound('Request')
    return json(requestView(found))
  })
  route('POST', `${O}/requests/${ID}/approve`, ({ params, body }) => {
    const b = body === undefined ? {} : requireBody(body)
    const errors: Record<string, string> = {}
    const durationSeconds = intField(b, 'durationSeconds', 60, 31_536_000, errors)
    const maxReads = intField(b, 'maxReads', 1, null, errors)
    let maxSensitivity: Sensitivity | undefined
    if (b.maxSensitivity !== undefined && b.maxSensitivity !== null) {
      if (
        typeof b.maxSensitivity !== 'string' ||
        !SENSITIVITIES.includes(b.maxSensitivity as Sensitivity)
      )
        throw unreadable()
      maxSensitivity = b.maxSensitivity as Sensitivity
    }
    if (Object.keys(errors).length > 0) throw validationFailed(errors)
    const scopes = Array.isArray(b.scopes) ? (b.scopes as string[]) : undefined
    return json(
      grantView(
        approve(params[0] ?? '', {
          ...(scopes ? { scopes } : {}),
          ...(durationSeconds !== undefined ? { durationSeconds } : {}),
          ...(maxReads !== undefined ? { maxReads } : {}),
          ...(maxSensitivity ? { maxSensitivity } : {}),
        }),
      ),
    )
  })
  route('POST', `${O}/requests/${ID}/deny`, ({ params, body }) => {
    const b = body === undefined ? {} : requireBody(body)
    const note = typeof b.note === 'string' ? b.note : null
    if (note !== null && note.length > 500)
      throw validationFailed({ note: 'size must be between 0 and 500' })
    return json(requestView(deny(params[0] ?? '', note)))
  })

  route('GET', `${O}/grants`, ({ query }) =>
    json(listGrants(query.get('includeInactive') === 'true')),
  )
  route('POST', `${O}/grants/${ID}/revoke`, ({ params }) => {
    const grant = grants.find((g) => g.id === params[0])
    if (!grant) throw notFound('Grant')
    revoke(grant, 'OWNER')
    return json(grantView(grant))
  })

  route('GET', `${O}/access-log`, ({ query }) => {
    const limit = Number(query.get('limit') ?? '50')
    const before = query.get('beforeSeq')
    return json(
      audit.history(
        Number.isFinite(limit) ? limit : 50,
        before ? Number(before) : null,
        query.get('clientId'),
      ),
    )
  })
  route('GET', `${O}/audit/verify`, () => json(audit.verify()))
  route('GET', `${O}/dashboard`, () => {
    const dashboard: Dashboard = {
      pendingRequests: requests.filter((r) => r.status === 'PENDING' && !requestExpired(r)).length,
      activeGrants: listGrants(false),
      recentAccess: audit.history(10, null, null),
    }
    return json(dashboard)
  })

  // ---- fetch ----

  const handle = (input: RequestInfo | URL, init?: RequestInit): Response => {
    const url = new URL(
      typeof input === 'string' ? input : input instanceof URL ? input.href : input.url,
      'http://localhost',
    )
    const method = (init?.method ?? 'GET').toUpperCase()
    const path = url.pathname.replace(/^\/api/, '')
    const token = new Headers(init?.headers).get('authorization')?.replace(/^Bearer /, '')
    const query = Object.fromEntries(url.searchParams)

    let body: unknown
    let bodyError: HttpProblem | null = null
    try {
      body = bodyOf(init)
    } catch (error) {
      bodyError = error as HttpProblem
    }
    calls.push({ method, path, query, body })

    const injected = failures.find((f) => f.remaining > 0 && f.matcher.test(`${method} ${path}`))
    if (injected) {
      injected.remaining -= 1
      return injected.response()
    }
    if (!token || token.endsWith('-expired')) {
      return problem(401, token ? 'The ID token has expired.' : 'Missing bearer token.', path, {
        code: 'UNAUTHORIZED',
      })
    }
    const match = routes
      .filter((r) => r.method === method)
      .map((r) => ({ r, m: r.pattern.exec(path) }))
      .find((x) => x.m !== null)
    if (!match?.m)
      return problem(404, `${method} ${path} does not exist.`, path, { code: 'NOT_FOUND' })
    try {
      if (bodyError) throw bodyError
      return match.r.handler({ params: match.m.slice(1), query: url.searchParams, body, path })
    } catch (error) {
      if (error instanceof HttpProblem) {
        return problem(error.status, error.message, path, {
          ...(error.code ? { code: error.code } : {}),
          ...error.extra,
        })
      }
      throw error
    }
  }

  const mockFetch = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    if (latencyMs > 0) await new Promise((resolve) => setTimeout(resolve, latencyMs))
    if (offline) throw new TypeError('Failed to fetch')
    return handle(input, init)
  }

  // ---- seed ----

  function runAt(daysAgo: number, hour: number, action: () => void) {
    const base = new Date(clock())
    base.setUTCHours(hour, 0, 0, 0)
    timeOverride = base.getTime() - daysAgo * 86_400_000
    try {
      action()
    } finally {
      timeOverride = null
    }
  }

  function seedDemo() {
    runAt(40, 9, () => {
      createAttribute('profile.name', 'Alex Rivera', 'PUBLIC')
      createAttribute('profile.sizes.shoe', 42, 'PERSONAL')
      createAttribute('profile.sizes.shirt', 'M', 'PERSONAL')
      createAttribute('profile.sizes.jacket', { size: 'L', fit: 'regular' }, 'PERSONAL')
      createAttribute('preferences.diet', 'vegetarian', 'PERSONAL')
      createAttribute('preferences.newsletter', true, 'PUBLIC')
      createAttribute(
        'addresses.home',
        { street: '14 Linden Road', city: 'Leeds', postcode: 'LS6 1AB' },
        'SENSITIVE',
      )
      createAttribute('health.allergies', ['peanuts', 'penicillin'], 'SENSITIVE')
      createAttribute('health.blood_type', 'O+', 'RESTRICTED')
    })
    let fit = ''
    let meals = ''
    let hub = ''
    runAt(30, 10, () => {
      fit = registerClient('Stride Shoes', 'support@stride.example', [
        'profile.sizes:read',
        'profile.name:read',
      ]).client.clientId
      meals = registerClient('Meal Planner', 'hello@mealplanner.example', [
        'health.allergies:read',
        'preferences:read',
      ]).client.clientId
      hub = registerClient('Health Hub', 'privacy@healthhub.example', ['health:read']).client
        .clientId
    })
    let fitRequest = ''
    runAt(21, 14, () => {
      fitRequest = createRequest({
        clientId: fit,
        scopes: ['profile.sizes:read', 'profile.name:read'],
        purpose: 'Recommend shoes that fit',
        durationSeconds: 90 * 86_400,
        maxReads: 100,
      }).id
    })
    let fitGrant = ''
    runAt(21, 15, () => {
      fitGrant = approve(fitRequest, {
        scopes: ['profile.sizes:read'],
        maxSensitivity: 'PERSONAL',
      }).id
    })
    for (const day of [14, 9, 3]) runAt(day, 11, () => simulateRead(fitGrant, 'profile.sizes'))
    let hubRequest = ''
    runAt(12, 16, () => {
      hubRequest = createRequest({
        clientId: hub,
        scopes: ['health.blood_type:read'],
        purpose: 'Emergency contact card',
        durationSeconds: 30 * 86_400,
      }).id
    })
    runAt(12, 17, () => {
      deny(hubRequest, 'Not needed')
    })
    runAt(2, 8, () => {
      createRequest({ clientId: meals, ...SCRIPTED_REQUESTS[1]! })
    })
    runAt(1, 18, () => {
      createRequest({ clientId: fit, ...SCRIPTED_REQUESTS[0]! })
    })
  }

  if ((options.seed ?? 'demo') === 'demo') seedDemo()

  let scriptIndex = 0

  return {
    fetch: mockFetch,
    calls,
    setOffline: (value) => {
      offline = value
    },
    failNext: (matcher, status, detail = 'Injected failure.', times = 1) => {
      failures.push({
        matcher,
        remaining: times,
        response: () => problem(status, detail, '/injected'),
      })
    },
    simulateAccessRequest: (input = {}) => {
      const scripted = SCRIPTED_REQUESTS[scriptIndex % SCRIPTED_REQUESTS.length]!
      scriptIndex += 1
      const active = [...clients.values()].map((c) => c.client).filter((c) => !c.disabledAt)
      const covers = (c: Client, scopes: string[]) =>
        scopes.every((s) => c.allowedScopes.some((a) => pathCovers(scopePathOf(a), scopePathOf(s))))
      const client = input.clientId
        ? clients.get(input.clientId)?.client
        : (active.find((c) => covers(c, scripted.scopes)) ?? active[0])
      if (!client) throw new Error('simulateAccessRequest: register an active client first')
      const scopes =
        input.scopes ?? (covers(client, scripted.scopes) ? scripted.scopes : client.allowedScopes)
      return requestView(
        createRequest({ ...scripted, ...input, clientId: client.clientId, scopes }),
      )
    },
    simulateRead,
    tamperAudit: (kind, seqNumber) => audit.tamper(kind, seqNumber),
    secretOf: (clientId) => clients.get(clientId)?.secret,
  }
}

function scopePathOf(scope: string): string {
  return parseScope(scope)?.path ?? scope
}
