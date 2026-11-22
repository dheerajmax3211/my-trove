import { EncodingError, fromBase64, randomBytes, toBase64 } from '../crypto/bytes'
import { parsePublicKey } from '../crypto/trusteeKeys'
import type {
  AcceptRequest,
  AcceptResponse,
  ChainView,
  CiphertextView,
  Contact,
  CreateVaultRequest,
  Decision,
  EscalationStep,
  InviteResponse,
  Quorum,
  Readiness,
  ShareView,
  StateView,
  SwitchPolicy,
  SwitchStateName,
  TimelineEntry,
  TrusteeCiphertextView,
  TrusteePhase,
  TrusteeStateView,
  TrusteeStatusName,
  TrusteeView,
  VaultMetadata,
  VaultSummary,
  VoteResponse,
} from '../api/types'
import { NO_VAULT_STATE } from '../api/types'
import { sha256Hex } from './sha256'

/**
 * In-memory stand-in for the digital-legacy service. It reimplements the backend's rules (state
 * machine, envelope validation, policy limits, pause budget, quorum + cool-off, audit hash chain,
 * the two disjoint authentication schemes) and answers with the same status codes and
 * problem+json shapes, so the UI is exercised against the real contract.
 *
 * Like the real server it only ever sees what clients send: ciphertext, sealed envelopes, public
 * keys and metadata. `requests` records every call so tests can prove no plaintext or key leaves
 * the browser.
 */

const SECOND = 1000
const HOUR = 3600 * SECOND
const DAY = 24 * HOUR

/** The service's configured limits (application.properties). */
export const LIMITS = {
  minInterval: HOUR,
  maxInterval: 366 * DAY,
  minGrace: 0,
  maxGrace: 90 * DAY,
  minCoolOff: HOUR,
  maxCoolOff: 30 * DAY,
  maxEscalation: 90 * DAY,
  maxPause: 60 * DAY,
  yearlyPauseBudget: 120 * DAY,
  pauseWindow: 365 * DAY,
  lateTolerance: HOUR,
  inviteTtl: 14 * DAY,
  maxTrustees: 10,
  maxCiphertextBytes: 1_048_576,
  maxMetadataBytes: 4096,
  maxSteps: 10,
  maxContacts: 5,
} as const

export interface RecordedRequest {
  method: string
  path: string
  authorization: string | null
  body: string | null
}

interface TrusteeRow {
  id: string
  label: string
  status: TrusteeStatusName
  inviteHash: string
  inviteExpiresAt: number
  inviteUsedAt: number | null
  accessHash: string | null
  keyAlgorithm: string | null
  publicKey: string | null
  keyFingerprint: string | null
  contacts: Contact[]
  sealedShare: Record<string, unknown> | null
  shareDigest: string | null
  shareVaultVersion: number | null
  acceptedAt: number | null
}

interface VaultRow {
  id: string
  ciphertext: string
  ciphertextBytes: number
  ciphertextSha256: string
  metadata: VaultMetadata
  vaultVersion: number
  contentRevision: number
  policy: SwitchPolicy | null
  armed: boolean
  state: SwitchStateName
  epoch: number
  enteredAt: number
  nextDueAt: number | null
  pausedUntil: number | null
  lastCheckinAt: number | null
  stepsExecuted: number
  quorumReachedAt: number | null
  releasedAt: number | null
  pauseWindowStart: number | null
  pauseUsedSeconds: number
  createdAt: number
  updatedAt: number
}

interface AuditRow {
  seq: number
  at: number
  actorKind: 'OWNER' | 'TRUSTEE' | 'SYSTEM'
  actorId: string
  eventType: string
  detail: Record<string, unknown>
  hash: string
}

class HttpProblem extends Error {
  constructor(
    readonly status: number,
    readonly title: string,
    detail: string,
    readonly extra: Record<string, unknown> = {},
  ) {
    super(detail)
  }
}

const notFound = (detail: string) => new HttpProblem(404, 'Not found', detail)

/** What the API answers for an owner with no vault: the same shapes, empty (see OwnerDtos.absent in the service). */
const absentSummary = (): VaultSummary => ({
  exists: false,
  id: null,
  state: NO_VAULT_STATE,
  armed: false,
  vaultVersion: 0,
  contentRevision: 0,
  ciphertextBytes: 0,
  ciphertextSha256: null,
  metadata: null,
  hasPolicy: false,
  createdAt: null,
  updatedAt: null,
})

const absentCiphertext = (): CiphertextView => ({
  ciphertext: null,
  metadata: null,
  vaultVersion: 0,
  sha256: null,
})

const absentState = (): StateView => ({
  state: NO_VAULT_STATE,
  armed: false,
  epoch: 0,
  lastCheckInAt: null,
  nextDueAt: null,
  pausedUntil: null,
  stateEnteredAt: null,
  nextActionAt: null,
  releasedAt: null,
  escalation: { stepsExecuted: 0, totalSteps: 0 },
  quorum: {
    required: 0,
    approved: 0,
    declined: 0,
    trusteesActive: 0,
    trusteesHoldingShare: 0,
    quorumReachedAt: null,
    releaseNotBefore: null,
  },
  pause: { usedSeconds: 0, yearlyBudgetSeconds: 0, maxSingleSeconds: 0 },
  readiness: { armable: false, problems: ['no vault yet'] },
  policy: null,
})
const conflict = (detail: string) =>
  new HttpProblem(409, 'Not allowed in the current state', detail)
const invalid = (problems: string[]) =>
  new HttpProblem(400, 'Invalid request', problems.join('; '), { problems })
const unauthorized = () => new HttpProblem(401, 'Unauthorized', 'Authentication is required.')
/** What Spring answers for a body that fails bean validation: no field details. */
const badContent = () => new HttpProblem(400, 'Bad Request', 'Invalid request content.')

const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v)

function newToken(): string {
  return toBase64(randomBytes(32)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

const EMAIL = /^[^@\s]+@[^@\s]+\.[^@\s]+$/
const PHONE = /^\+[1-9][0-9]{6,14}$/

function checkBytes(field: string, value: unknown, min: number, max: number, problems: string[]) {
  if (typeof value !== 'string') {
    problems.push(`${field} must be a Base64 string`)
    return
  }
  try {
    const n = fromBase64(value).length
    if (n < min || n > max)
      problems.push(
        `${field} must decode to ${min === max ? `${min} bytes` : `${min}..${max} bytes`}`,
      )
  } catch (e) {
    if (e instanceof EncodingError) problems.push(`${field} is not valid Base64`)
    else throw e
  }
}

const URGENCY_ORDER = ['NOTICE', 'WARNING', 'URGENT', 'FINAL']

export class MockBackend {
  /** Every request the server received, in order. */
  readonly requests: RecordedRequest[] = []
  private offset = 0
  private vault: VaultRow | null = null
  private trustees: TrusteeRow[] = []
  /** epoch -> trusteeId -> decision */
  private votes = new Map<number, Map<string, Decision>>()
  private audit: AuditRow[] = []
  private ids = 0

  // ---- clock ----------------------------------------------------------------------------------

  now(): number {
    return Date.now() + this.offset
  }

  /**
   * Moves the mock clock forward while the scheduler keeps ticking (every few minutes, like the real
   * 30-second tick), so transitions land at their nominal times instead of being treated as the
   * aftermath of an outage.
   */
  advance(ms: number): void {
    const step = 10 * 60 * SECOND
    for (let left = ms; left > 0; left -= step) {
      this.offset += Math.min(step, left)
      this.tick()
    }
  }

  /** Test hook: edits history behind the audit chain's back, as an admin who disabled the trigger might. */
  tamperWithAudit(seq: number): void {
    const row = this.audit.find((r) => r.seq === seq)
    if (row) row.detail = { ...row.detail, tampered: true }
  }

  // ---- the fetch entry point ------------------------------------------------------------------

  readonly fetch: typeof fetch = async (input, init) => {
    const url = new URL(
      typeof input === 'string' ? input : input instanceof URL ? input.href : input.url,
      'http://localhost',
    )
    const method = (init?.method ?? 'GET').toUpperCase()
    const path = url.pathname.replace(/^\/api/, '')
    const authorization = new Headers(init?.headers).get('authorization')
    const body = typeof init?.body === 'string' ? init.body : null
    this.requests.push({ method, path: path + url.search, authorization, body })
    await Promise.resolve()
    try {
      this.tick()
      const result = await this.route(method, path, url.searchParams, authorization, body)
      return result === undefined
        ? new Response(null, { status: 204 })
        : new Response(JSON.stringify(result.body), {
            status: result.status,
            headers: { 'content-type': 'application/json' },
          })
    } catch (error) {
      if (error instanceof HttpProblem) {
        return new Response(
          JSON.stringify({
            type: 'about:blank',
            title: error.title,
            status: error.status,
            detail: error.message,
            ...error.extra,
          }),
          { status: error.status, headers: { 'content-type': 'application/problem+json' } },
        )
      }
      throw error
    }
  }

  private async route(
    method: string,
    path: string,
    query: URLSearchParams,
    authorization: string | null,
    rawBody: string | null,
  ): Promise<{ status: number; body: unknown } | undefined> {
    const json = (): Record<string, unknown> => {
      try {
        const parsed: unknown = JSON.parse(rawBody ?? '')
        if (isRecord(parsed)) return parsed
      } catch {
        /* fall through */
      }
      throw new HttpProblem(400, 'Bad Request', 'Failed to read request')
    }
    const ok = (body: unknown, status = 200) => ({ status, body })

    // Trustee chain: only trustee tokens, only /trustee/**; accept is public.
    const trusteeBase = '/v1/legacy/trustee'
    if (path.startsWith(trusteeBase)) {
      if (method === 'POST' && path === `${trusteeBase}/accept`)
        return ok(await this.accept(json()), 201)
      const trustee = this.authenticateTrustee(authorization)
      switch (`${method} ${path.slice(trusteeBase.length)}`) {
        case 'GET /me':
          return ok(this.trusteeMe(trustee))
        case 'POST /share/confirm':
          return ok(this.confirmShare(trustee, json()))
        case 'POST /approval':
          return ok(this.vote(trustee, json()))
        case 'GET /share':
          return ok(this.fetchShare(trustee))
        case 'GET /ciphertext':
          return ok(this.fetchTrusteeCiphertext(trustee))
        default:
          throw notFound(`${method} ${path} does not exist.`)
      }
    }

    // Owner chain: Firebase bearer token only. A Trustee header is rejected here.
    const bearer = /^Bearer (.+)$/.exec(authorization ?? '')?.[1]
    if (!bearer || bearer.endsWith('-expired')) throw unauthorized()
    const base = '/v1/legacy/vault'
    if (!path.startsWith(base)) throw notFound(`${method} ${path} does not exist.`)
    const sub = path.slice(base.length)
    const trusteeRoute = /^\/trustees\/([^/]+)(\/share)?$/.exec(sub)

    if (sub === '') {
      if (method === 'POST') return ok(this.createVault(json()), 201)
      if (method === 'PUT') return ok(this.updateVault(json()))
      if (method === 'GET') return ok(this.vault ? this.summary(this.vault) : absentSummary())
    }
    if (method === 'GET' && sub === '/ciphertext')
      return ok(this.vault ? this.ownerCiphertext() : absentCiphertext())
    if (method === 'PUT' && sub === '/policy') return ok(this.setPolicy(json()))
    if (method === 'GET' && sub === '/state')
      return ok(this.vault ? this.stateView(this.vault) : absentState())
    if (method === 'POST' && sub === '/arm') return ok(this.arm())
    if (method === 'POST' && sub === '/disarm') return ok(this.disarm())
    if (method === 'POST' && sub === '/checkin') return ok(this.checkIn())
    if (method === 'POST' && sub === '/pause') return ok(this.pause(json()))
    if (method === 'POST' && sub === '/resume') return ok(this.resume())
    if (method === 'GET' && sub === '/timeline')
      return ok(this.vault ? this.timeline(Number(query.get('limit') ?? 100)) : [])
    if (method === 'GET' && sub === '/audit/verify')
      return ok(
        this.vault
          ? this.verifyAudit()
          : { intact: true, length: 0, headHash: null, firstBadSeq: null },
      )
    if (sub === '/trustees') {
      if (method === 'POST') return ok(this.invite(json()), 201)
      if (method === 'GET') return ok(this.vault ? this.listTrustees() : [])
    }
    const id = trusteeRoute?.[1]
    if (id && !trusteeRoute[2] && method === 'DELETE') {
      this.revoke(id)
      return undefined
    }
    if (id && trusteeRoute[2] && method === 'PUT') return ok(this.uploadShare(id, json()))
    throw notFound(`${method} ${path} does not exist.`)
  }

  // ---- helpers --------------------------------------------------------------------------------

  private nextId(): string {
    this.ids += 1
    return `00000000-0000-4000-8000-${String(this.ids).padStart(12, '0')}`
  }

  private iso(ms: number | null): string | null {
    return ms === null ? null : new Date(ms).toISOString()
  }

  private requireVault(): VaultRow {
    if (!this.vault) throw notFound('No vault')
    return this.vault
  }

  private record(
    kind: AuditRow['actorKind'],
    actorId: string,
    eventType: string,
    detail: Record<string, unknown>,
    at = this.now(),
  ): void {
    const prev = this.audit[this.audit.length - 1]?.hash ?? ''
    const seq = this.audit.length + 1
    this.audit.push({
      seq,
      at,
      actorKind: kind,
      actorId,
      eventType,
      detail,
      hash: this.chainHash(prev, { seq, at, actorKind: kind, actorId, eventType, detail }),
    })
  }

  private chainHash(prev: string, r: Omit<AuditRow, 'hash'>): string {
    return sha256Hex(
      `${prev}|${r.seq}|${r.at}|${r.actorKind}|${r.actorId}|${r.eventType}|${JSON.stringify(r.detail)}`,
    )
  }

  private owner(eventType: string, detail: Record<string, unknown> = {}): void {
    this.record('OWNER', 'demo-user', eventType, detail)
  }

  private requireActive(v: VaultRow, message: string): void {
    if (v.state !== 'ACTIVE') throw conflict(`${message}; check in first`)
  }

  private activeTrustees(): TrusteeRow[] {
    return this.trustees.filter((t) => t.status !== 'REVOKED')
  }

  private holdsShare(t: TrusteeRow, v: VaultRow): boolean {
    return (
      (t.status === 'SHARE_UPLOADED' || t.status === 'CONFIRMED') &&
      t.sealedShare !== null &&
      t.shareVaultVersion === v.vaultVersion
    )
  }

  // ---- vault content --------------------------------------------------------------------------

  private validateVault(req: Record<string, unknown>): CreateVaultRequest {
    const { ciphertext, metadata } = req
    if (typeof ciphertext !== 'string' || ciphertext === '' || !isRecord(metadata))
      throw badContent()
    const problems: string[] = []
    try {
      const n = fromBase64(ciphertext).length
      if (n < 17) problems.push('ciphertext is too short to be AES-GCM output')
      if (n > LIMITS.maxCiphertextBytes)
        problems.push(`ciphertext exceeds ${LIMITS.maxCiphertextBytes} bytes`)
    } catch {
      problems.push('ciphertext is not valid Base64')
    }
    for (const key of Object.keys(metadata))
      if (!['v', 'alg', 'nonce', 'kdf'].includes(key))
        problems.push(`metadata has an unknown field '${key.slice(0, 32)}'`)
    if (metadata.v !== 1) problems.push('metadata.v must be between 1 and 1')
    if (metadata.alg !== 'AES-256-GCM') problems.push('metadata.alg must be AES-256-GCM')
    checkBytes('metadata.nonce', metadata.nonce, 12, 12, problems)
    if (JSON.stringify(metadata).length > LIMITS.maxMetadataBytes)
      problems.push(`metadata exceeds ${LIMITS.maxMetadataBytes} bytes`)
    if (problems.length > 0) throw invalid(problems)
    return { ciphertext, metadata: metadata as unknown as VaultMetadata }
  }

  private createVault(body: Record<string, unknown>): VaultSummary {
    const req = this.validateVault(body)
    if (this.vault) throw conflict('You already have a vault; update it instead')
    const now = this.now()
    const bytes = fromBase64(req.ciphertext)
    this.vault = {
      id: this.nextId(),
      ciphertext: req.ciphertext,
      ciphertextBytes: bytes.length,
      ciphertextSha256: sha256Hex(bytes),
      metadata: req.metadata,
      vaultVersion: 1,
      contentRevision: 1,
      policy: null,
      armed: false,
      state: 'ACTIVE',
      epoch: 0,
      enteredAt: now,
      nextDueAt: null,
      pausedUntil: null,
      lastCheckinAt: null,
      stepsExecuted: 0,
      quorumReachedAt: null,
      releasedAt: null,
      pauseWindowStart: null,
      pauseUsedSeconds: 0,
      createdAt: now,
      updatedAt: now,
    }
    this.owner('VAULT_CREATED', { bytes: bytes.length, sha256: this.vault.ciphertextSha256 })
    return this.summary(this.vault)
  }

  private updateVault(body: Record<string, unknown>): VaultSummary {
    const v = this.requireVault()
    this.requireActive(v, 'Vault content can only be changed while the switch is ACTIVE')
    const req = this.validateVault(body)
    const keyRotated = body.keyRotated === true
    const bytes = fromBase64(req.ciphertext)
    v.ciphertext = req.ciphertext
    v.ciphertextBytes = bytes.length
    v.ciphertextSha256 = sha256Hex(bytes)
    v.metadata = req.metadata
    v.contentRevision += 1
    v.updatedAt = this.now()
    const detail: Record<string, unknown> = {
      bytes: bytes.length,
      sha256: v.ciphertextSha256,
      keyRotated,
    }
    if (keyRotated) {
      v.vaultVersion += 1
      for (const t of this.trustees) {
        if (t.status === 'SHARE_UPLOADED' || t.status === 'CONFIRMED') t.status = 'ACCEPTED'
        t.sealedShare = null
        t.shareDigest = null
        t.shareVaultVersion = null
      }
      if (v.armed) {
        detail.disarmed = true
        v.armed = false
      }
    }
    this.owner(keyRotated ? 'VAULT_ROTATED' : 'VAULT_UPDATED', detail)
    return this.summary(v)
  }

  private ownerCiphertext(): CiphertextView {
    const v = this.requireVault()
    return {
      ciphertext: v.ciphertext,
      metadata: v.metadata,
      vaultVersion: v.vaultVersion,
      sha256: v.ciphertextSha256,
    }
  }

  private summary(v: VaultRow): VaultSummary {
    return {
      exists: true,
      id: v.id,
      state: v.state,
      armed: v.armed,
      vaultVersion: v.vaultVersion,
      contentRevision: v.contentRevision,
      ciphertextBytes: v.ciphertextBytes,
      ciphertextSha256: v.ciphertextSha256,
      metadata: v.metadata,
      hasPolicy: v.policy !== null,
      createdAt: new Date(v.createdAt).toISOString(),
      updatedAt: new Date(v.updatedAt).toISOString(),
    }
  }

  // ---- policy and switch control --------------------------------------------------------------

  private validatePolicy(raw: Record<string, unknown>): SwitchPolicy {
    const numeric = [
      'checkInIntervalSeconds',
      'graceSeconds',
      'escalationDurationSeconds',
      'coolOffSeconds',
      'quorum',
      'maxPauseSeconds',
    ]
    if (
      numeric.some((k) => typeof raw[k] !== 'number') ||
      !Array.isArray(raw.steps) ||
      raw.steps.length === 0 ||
      !Array.isArray(raw.ownerContacts) ||
      raw.ownerContacts.length === 0 ||
      (raw.checkInIntervalSeconds as number) < 1 ||
      (raw.coolOffSeconds as number) < 1 ||
      (raw.quorum as number) < 1
    )
      throw badContent()
    const policy = raw as unknown as SwitchPolicy
    const problems: string[] = []
    const range = (field: string, seconds: number, min: number, max: number) => {
      if (seconds * SECOND < min || seconds * SECOND > max)
        problems.push(`${field} must be between ${min / SECOND} and ${max / SECOND}`)
    }
    range(
      'checkInIntervalSeconds',
      policy.checkInIntervalSeconds,
      LIMITS.minInterval,
      LIMITS.maxInterval,
    )
    range('graceSeconds', policy.graceSeconds, LIMITS.minGrace, LIMITS.maxGrace)
    range('coolOffSeconds', policy.coolOffSeconds, LIMITS.minCoolOff, LIMITS.maxCoolOff)
    if (policy.escalationDurationSeconds * SECOND > LIMITS.maxEscalation)
      problems.push(`escalationDurationSeconds exceeds ${LIMITS.maxEscalation / SECOND}`)
    if (policy.maxPauseSeconds * SECOND > LIMITS.maxPause)
      problems.push(`maxPauseSeconds exceeds the platform maximum of ${LIMITS.maxPause / SECOND}`)
    if (policy.quorum > LIMITS.maxTrustees)
      problems.push(`quorum exceeds the maximum number of trustees (${LIMITS.maxTrustees})`)
    if (policy.steps.length > LIMITS.maxSteps)
      problems.push(`at most ${LIMITS.maxSteps} escalation steps`)
    let prevOffset = -1
    let prevUrgency = -1
    policy.steps.forEach((s: EscalationStep, i) => {
      if (s.offsetSeconds <= prevOffset)
        problems.push(`steps[${i}].offsetSeconds must be strictly greater than the previous step`)
      const u = URGENCY_ORDER.indexOf(s.urgency)
      if (u < prevUrgency)
        problems.push(`steps[${i}].urgency must not be lower than the previous step`)
      if (new Set(s.channels).size !== s.channels.length)
        problems.push(`steps[${i}].channels must not repeat`)
      prevOffset = s.offsetSeconds
      prevUrgency = u
    })
    if (prevOffset > policy.escalationDurationSeconds)
      problems.push("escalationDurationSeconds must be at least the last step's offsetSeconds")
    this.validateContacts('ownerContacts', policy.ownerContacts, problems)
    if (problems.length > 0) throw invalid(problems)
    return policy
  }

  private validateContacts(field: string, contacts: Contact[], problems: string[]): void {
    if (contacts.length > LIMITS.maxContacts)
      problems.push(`${field} allows at most ${LIMITS.maxContacts} contacts`)
    const seen = new Set<string>()
    contacts.forEach((c, i) => {
      const ok =
        c.channel === 'EMAIL'
          ? EMAIL.test(c.address)
          : c.channel === 'SMS'
            ? PHONE.test(c.address)
            : c.channel === 'PUSH'
              ? c.address.length >= 8 && c.address.length <= 254 && !c.address.includes(' ')
              : false
      if (!ok) problems.push(`${field}[${i}] has an invalid ${String(c.channel)} address`)
      const key = `${c.channel}:${c.address}`
      if (seen.has(key)) problems.push(`${field}[${i}] is a duplicate`)
      seen.add(key)
    })
  }

  private setPolicy(raw: Record<string, unknown>): StateView {
    const v = this.requireVault()
    this.requireActive(v, 'The policy can only be changed while the switch is ACTIVE')
    const policy = this.validatePolicy(raw)
    const active = this.activeTrustees().length
    if (active > 0 && policy.quorum > active)
      throw conflict(`quorum ${policy.quorum} exceeds the number of trustees (${active})`)
    v.policy = policy
    // a changed policy restarts the interval of an armed switch, exactly like a check-in
    if (v.armed) this.resetToActive(v, this.now())
    this.owner('POLICY_SET', {
      intervalSeconds: policy.checkInIntervalSeconds,
      graceSeconds: policy.graceSeconds,
      coolOffSeconds: policy.coolOffSeconds,
      quorum: policy.quorum,
      steps: policy.steps.length,
      armed: v.armed,
    })
    return this.stateView(v)
  }

  private resetToActive(v: VaultRow, now: number): void {
    v.state = 'ACTIVE'
    v.enteredAt = now
    v.nextDueAt = v.policy ? now + v.policy.checkInIntervalSeconds * SECOND : null
    v.pausedUntil = null
    v.stepsExecuted = 0
    v.quorumReachedAt = null
    v.lastCheckinAt = now
  }

  private readiness(v: VaultRow): Readiness {
    const problems: string[] = []
    if (!v.policy) problems.push('no check-in policy set')
    else {
      const holders = this.activeTrustees().filter((t) => this.holdsShare(t, v)).length
      if (holders < v.policy.quorum)
        problems.push(
          `only ${holders} trustee(s) hold a share of the current key but the quorum is ${v.policy.quorum}`,
        )
    }
    return { armable: problems.length === 0, problems }
  }

  private arm(): StateView {
    const v = this.requireVault()
    if (v.armed) return this.stateView(v)
    this.requireActive(v, 'Only an ACTIVE switch can be armed')
    const readiness = this.readiness(v)
    if (!readiness.armable) throw conflict(`Not ready to arm: ${readiness.problems.join('; ')}`)
    v.armed = true
    this.resetToActive(v, this.now())
    this.owner('ARMED', { nextDueAt: this.iso(v.nextDueAt) })
    return this.stateView(v)
  }

  private disarm(): StateView {
    const v = this.requireVault()
    if (v.state === 'RELEASED') throw conflict('The vault has already been released')
    const previous = v.state
    v.armed = false
    if (v.policy) this.resetToActive(v, this.now())
    this.owner('DISARMED', { previousState: previous })
    return this.stateView(v)
  }

  private checkIn(): StateView {
    const v = this.requireVault()
    if (v.state === 'RELEASED')
      throw conflict('The vault has already been released; a check-in can no longer cancel it')
    const now = this.now()
    const previous = v.state
    const invalidated = previous === 'RELEASE_PENDING' ? this.approvalCount(v) : 0
    if (v.pausedUntil !== null) {
      this.refundPause(v, now)
      this.owner('PAUSE_ENDED', { reason: 'check-in' })
    }
    if (v.policy) this.resetToActive(v, now)
    v.lastCheckinAt = now
    this.owner('CHECK_IN', { previousState: previous, approvalsInvalidated: invalidated })
    if (previous !== 'ACTIVE')
      this.owner('STATE_CHANGED', {
        from: previous,
        to: 'ACTIVE',
        epoch: v.epoch,
        reason: 'owner check-in',
      })
    return this.stateView(v)
  }

  private windowedUsedSeconds(v: VaultRow, now: number): number {
    if (v.pauseWindowStart === null || now >= v.pauseWindowStart + LIMITS.pauseWindow) {
      v.pauseWindowStart = now
      v.pauseUsedSeconds = 0
    }
    return v.pauseUsedSeconds
  }

  private refundPause(v: VaultRow, now: number): void {
    const unused = Math.max(0, Math.floor(((v.pausedUntil ?? now) - now) / SECOND))
    v.pauseUsedSeconds = Math.max(0, v.pauseUsedSeconds - unused)
    v.pausedUntil = null
  }

  private pause(body: Record<string, unknown>): StateView {
    const v = this.requireVault()
    const seconds = body.durationSeconds
    if (typeof seconds !== 'number' || !Number.isInteger(seconds) || seconds < 1) throw badContent()
    if (!v.armed || !v.policy) throw conflict('The switch is not armed; there is nothing to pause')
    const now = this.now()
    if (v.state !== 'ACTIVE')
      throw conflict('Pausing is only possible while the switch is ACTIVE; check in first')
    if (v.pausedUntil !== null) throw conflict('The switch is already paused')
    if (v.nextDueAt === null || now >= v.nextDueAt)
      throw conflict('A check-in is overdue; check in before pausing')
    const cap = Math.min(v.policy.maxPauseSeconds * SECOND, LIMITS.maxPause)
    if (seconds * SECOND > cap)
      throw conflict(
        `Pause of ${Math.floor((seconds * SECOND) / DAY)}d exceeds the maximum of ${Math.floor(cap / DAY)}d (${cap / SECOND}s)`,
      )
    if ((this.windowedUsedSeconds(v, now) + seconds) * SECOND > LIMITS.yearlyPauseBudget)
      throw conflict(
        `Pause would exceed the yearly vacation budget of ${LIMITS.yearlyPauseBudget / DAY} days`,
      )
    v.pausedUntil = now + seconds * SECOND
    v.pauseUsedSeconds += seconds
    this.owner('PAUSED', { until: this.iso(v.pausedUntil), durationSeconds: seconds })
    return this.stateView(v)
  }

  private resume(): StateView {
    const v = this.requireVault()
    if (v.pausedUntil === null || !v.policy) throw conflict('The switch is not paused')
    const now = this.now()
    this.refundPause(v, now)
    this.resetToActive(v, now)
    this.owner('PAUSE_ENDED', { reason: 'resumed by owner' })
    return this.stateView(v)
  }

  // ---- views ----------------------------------------------------------------------------------

  private approvalCount(v: VaultRow): number {
    let count = 0
    for (const [id, decision] of this.votes.get(v.epoch) ?? []) {
      const t = this.trustees.find((x) => x.id === id)
      if (decision === 'APPROVE' && t && t.status !== 'REVOKED') count += 1
    }
    return count
  }

  private nextActionAt(v: VaultRow): number | null {
    if (!v.armed || !v.policy) return null
    const p = v.policy
    switch (v.state) {
      case 'ACTIVE':
        return v.pausedUntil ?? v.nextDueAt
      case 'GRACE':
        return v.enteredAt + p.graceSeconds * SECOND
      case 'ESCALATING': {
        const step = p.steps[v.stepsExecuted]
        return v.enteredAt + (step ? step.offsetSeconds : p.escalationDurationSeconds) * SECOND
      }
      case 'RELEASE_PENDING':
        return v.quorumReachedAt === null ? null : v.quorumReachedAt + p.coolOffSeconds * SECOND
      case 'RELEASED':
        return null
    }
  }

  private stateView(v: VaultRow): StateView {
    const team = this.activeTrustees()
    const voting = v.state === 'RELEASE_PENDING' || v.state === 'RELEASED'
    let approved = 0
    let declined = 0
    if (voting)
      for (const [id, decision] of this.votes.get(v.epoch) ?? []) {
        if (!team.some((t) => t.id === id)) continue
        if (decision === 'APPROVE') approved += 1
        else declined += 1
      }
    const p = v.policy
    const quorum: Quorum = {
      required: p?.quorum ?? 0,
      approved,
      declined,
      trusteesActive: team.length,
      trusteesHoldingShare: team.filter((t) => this.holdsShare(t, v)).length,
      quorumReachedAt: this.iso(v.quorumReachedAt),
      releaseNotBefore:
        v.quorumReachedAt === null || !p
          ? null
          : this.iso(v.quorumReachedAt + p.coolOffSeconds * SECOND),
    }
    const windowOpen =
      v.pauseWindowStart !== null && this.now() < v.pauseWindowStart + LIMITS.pauseWindow
    return {
      state: v.state,
      armed: v.armed,
      epoch: v.epoch,
      lastCheckInAt: this.iso(v.lastCheckinAt),
      nextDueAt: this.iso(v.nextDueAt),
      pausedUntil: this.iso(v.pausedUntil),
      stateEnteredAt: this.iso(v.enteredAt),
      nextActionAt: this.iso(this.nextActionAt(v)),
      releasedAt: this.iso(v.releasedAt),
      escalation: { stepsExecuted: v.stepsExecuted, totalSteps: p?.steps.length ?? 0 },
      quorum,
      pause: {
        usedSeconds: windowOpen ? v.pauseUsedSeconds : 0,
        yearlyBudgetSeconds: LIMITS.yearlyPauseBudget / SECOND,
        maxSingleSeconds: p ? Math.min(p.maxPauseSeconds, LIMITS.maxPause / SECOND) : 0,
      },
      readiness: this.readiness(v),
      policy: p,
    }
  }

  private timeline(limit: number): TimelineEntry[] {
    this.requireVault()
    const n = Math.max(1, Math.min(limit, 500))
    return [...this.audit]
      .reverse()
      .slice(0, n)
      .map((r) => ({
        seq: r.seq,
        at: new Date(r.at).toISOString(),
        actorKind: r.actorKind,
        eventType: r.eventType,
        detail: r.detail,
      }))
  }

  private verifyAudit(): ChainView {
    this.requireVault()
    let prev = ''
    for (const r of this.audit) {
      if (this.chainHash(prev, r) !== r.hash)
        return { intact: false, length: this.audit.length, headHash: null, firstBadSeq: r.seq }
      prev = r.hash
    }
    return {
      intact: true,
      length: this.audit.length,
      headHash: this.audit.length === 0 ? null : prev,
      firstBadSeq: null,
    }
  }

  // ---- scheduler ------------------------------------------------------------------------------

  /** Applies every transition that is due, exactly like the service's scheduler tick. */
  private tick(): void {
    if (this.vault) this.advanceVault(this.vault, this.now())
  }

  private due(nominal: number, now: number): number | null {
    if (now < nominal) return null
    return now - nominal > LIMITS.lateTolerance ? now : nominal
  }

  private system(eventType: string, detail: Record<string, unknown>, now: number): void {
    this.record('SYSTEM', 'scheduler', eventType, detail, now)
  }

  private advanceVault(v: VaultRow, now: number): void {
    const p = v.policy
    if (!p || !v.armed) return
    for (let i = 0; i < 500; i++) {
      if (!this.advanceOnce(v, p, now)) break
    }
    v.updatedAt = now
  }

  /** Applies one due transition; false when nothing is due. */
  private advanceOnce(v: VaultRow, p: SwitchPolicy, now: number): boolean {
    switch (v.state) {
      case 'ACTIVE': {
        if (v.pausedUntil !== null) {
          const at = this.due(v.pausedUntil, now)
          if (at === null) return false
          v.pausedUntil = null
          v.nextDueAt = at + p.checkInIntervalSeconds * SECOND
          v.enteredAt = at
          this.system('PAUSE_ENDED', { nextDueAt: this.iso(v.nextDueAt) }, now)
          return true
        }
        const at = v.nextDueAt === null ? null : this.due(v.nextDueAt, now)
        if (at === null) return false
        v.state = 'GRACE'
        v.enteredAt = at
        v.epoch += 1
        this.system(
          'STATE_CHANGED',
          { from: 'ACTIVE', to: 'GRACE', epoch: v.epoch, reason: 'check-in missed' },
          now,
        )
        return true
      }
      case 'GRACE': {
        const at = this.due(v.enteredAt + p.graceSeconds * SECOND, now)
        if (at === null) return false
        v.state = 'ESCALATING'
        v.enteredAt = at
        v.stepsExecuted = 0
        this.system(
          'STATE_CHANGED',
          { from: 'GRACE', to: 'ESCALATING', epoch: v.epoch, reason: 'grace elapsed' },
          now,
        )
        return true
      }
      case 'ESCALATING': {
        const step = p.steps[v.stepsExecuted]
        if (step) {
          const dueAt = v.enteredAt + step.offsetSeconds * SECOND
          if (now < dueAt) return false
          const slip = now - dueAt > LIMITS.lateTolerance ? now - dueAt : 0
          v.enteredAt += slip
          v.stepsExecuted += 1
          this.system(
            'ESCALATION_STEP_EXECUTED',
            {
              step: v.stepsExecuted - 1,
              urgency: step.urgency,
              audience: step.audience,
              slippedSeconds: slip / SECOND,
            },
            now,
          )
          return true
        }
        const at = this.due(v.enteredAt + p.escalationDurationSeconds * SECOND, now)
        if (at === null) return false
        v.state = 'RELEASE_PENDING'
        v.enteredAt = at
        this.system(
          'STATE_CHANGED',
          {
            from: 'ESCALATING',
            to: 'RELEASE_PENDING',
            epoch: v.epoch,
            reason: 'escalation exhausted',
          },
          now,
        )
        return true
      }
      case 'RELEASE_PENDING': {
        const met = this.approvalCount(v) >= p.quorum
        if (v.quorumReachedAt === null) {
          if (!met) return false
          v.quorumReachedAt = now
          this.system(
            'QUORUM_REACHED',
            {
              required: p.quorum,
              releaseNotBefore: new Date(now + p.coolOffSeconds * SECOND).toISOString(),
            },
            now,
          )
          return true
        }
        if (!met) {
          v.quorumReachedAt = null
          this.system('QUORUM_LOST', {}, now)
          return true
        }
        if (now < v.quorumReachedAt + p.coolOffSeconds * SECOND) return false
        v.state = 'RELEASED'
        v.releasedAt = now
        v.enteredAt = now
        this.system('RELEASED', { epoch: v.epoch }, now)
        return true
      }
      case 'RELEASED':
        return false
    }
  }

  // ---- trustees (owner side) ------------------------------------------------------------------

  private invite(body: Record<string, unknown>): InviteResponse {
    const label = body.label
    if (typeof label !== 'string' || label.trim() === '' || label.length > 100) throw badContent()
    const v = this.requireVault()
    this.requireActive(v, 'Trustees can only be changed while the switch is ACTIVE')
    if (this.activeTrustees().length >= LIMITS.maxTrustees)
      throw conflict(`At most ${LIMITS.maxTrustees} trustees are allowed`)
    const now = this.now()
    const token = newToken()
    const row: TrusteeRow = {
      id: this.nextId(),
      label: label.trim(),
      status: 'INVITED',
      inviteHash: sha256Hex(token),
      inviteExpiresAt: now + LIMITS.inviteTtl,
      inviteUsedAt: null,
      accessHash: null,
      keyAlgorithm: null,
      publicKey: null,
      keyFingerprint: null,
      contacts: [],
      sealedShare: null,
      shareDigest: null,
      shareVaultVersion: null,
      acceptedAt: null,
    }
    this.trustees.push(row)
    this.owner('TRUSTEE_INVITED', { trusteeId: row.id })
    return {
      trusteeId: row.id,
      label: row.label,
      inviteToken: token,
      inviteExpiresAt: new Date(row.inviteExpiresAt).toISOString(),
    }
  }

  private trusteeView(t: TrusteeRow, v: VaultRow): TrusteeView {
    return {
      id: t.id,
      label: t.label,
      status: t.status,
      keyAlgorithm: t.keyAlgorithm,
      publicKey: t.publicKey,
      keyFingerprint: t.keyFingerprint,
      shareUploaded: t.sealedShare !== null,
      shareVaultVersion: t.shareVaultVersion,
      shareCurrent: this.holdsShare(t, v),
      shareConfirmed: t.status === 'CONFIRMED',
      acceptedAt: this.iso(t.acceptedAt),
      inviteExpiresAt: t.inviteUsedAt === null ? this.iso(t.inviteExpiresAt) : null,
    }
  }

  private listTrustees(): TrusteeView[] {
    const v = this.requireVault()
    return this.trustees.map((t) => this.trusteeView(t, v))
  }

  private revoke(id: string): void {
    const v = this.requireVault()
    this.requireActive(v, 'Trustees can only be changed while the switch is ACTIVE')
    const t = this.trustees.find((x) => x.id === id)
    if (!t) throw notFound('No such trustee')
    if (t.status === 'REVOKED') return
    if (v.armed && v.policy) {
      const remaining = this.activeTrustees().filter(
        (x) => x.id !== id && this.holdsShare(x, v),
      ).length
      if (remaining < v.policy.quorum)
        throw conflict(
          'Revoking this trustee would leave fewer share holders than the quorum; disarm first',
        )
    }
    t.status = 'REVOKED'
    this.owner('TRUSTEE_REVOKED', { trusteeId: id })
  }

  private uploadShare(id: string, body: Record<string, unknown>): TrusteeView {
    const v = this.requireVault()
    this.requireActive(v, 'Shares can only be uploaded while the switch is ACTIVE')
    const t = this.trustees.find((x) => x.id === id)
    if (!t) throw notFound('No such trustee')
    const envelope = body.sealedShare
    const version = body.vaultVersion
    if (!isRecord(envelope) || typeof version !== 'number') throw badContent()
    if (t.status === 'INVITED' || t.status === 'REVOKED' || t.publicKey === null)
      throw conflict('The trustee has not accepted the invite yet (or was revoked)')
    if (version !== v.vaultVersion)
      throw conflict(
        `Share is for key version ${version} but the vault is at key version ${v.vaultVersion}`,
      )
    const problems: string[] = []
    const x25519 = t.keyAlgorithm === 'X25519'
    const allowed = x25519 ? ['v', 'alg', 'epk', 'nonce', 'ct'] : ['v', 'alg', 'ek', 'nonce', 'ct']
    for (const key of Object.keys(envelope))
      if (!allowed.includes(key))
        problems.push(`sealedShare has an unknown field '${key.slice(0, 32)}'`)
    if (envelope.v !== 1) problems.push('sealedShare.v must be between 1 and 1')
    if (x25519) {
      if (envelope.alg !== 'X25519-HKDF-SHA256-AES256GCM')
        problems.push('sealedShare.alg must be X25519-HKDF-SHA256-AES256GCM for an X25519 trustee')
      checkBytes('sealedShare.epk', envelope.epk, 32, 32, problems)
    } else {
      if (envelope.alg !== 'RSA-OAEP-SHA256-AES256GCM')
        problems.push('sealedShare.alg must be RSA-OAEP-SHA256-AES256GCM for an RSA-OAEP trustee')
      checkBytes('sealedShare.ek', envelope.ek, 256, 512, problems)
    }
    checkBytes('sealedShare.nonce', envelope.nonce, 12, 12, problems)
    checkBytes('sealedShare.ct', envelope.ct, 24, 4096, problems)
    if (problems.length > 0) throw invalid(problems)
    const canonical = JSON.stringify(
      Object.fromEntries(Object.entries(envelope).sort(([a], [b]) => a.localeCompare(b))),
    )
    t.sealedShare = envelope
    t.shareDigest = sha256Hex(canonical)
    t.shareVaultVersion = v.vaultVersion
    t.status = 'SHARE_UPLOADED'
    this.owner('SHARE_UPLOADED', {
      trusteeId: t.id,
      sha256: t.shareDigest,
      vaultVersion: v.vaultVersion,
    })
    return this.trusteeView(t, v)
  }

  // ---- trustee portal -------------------------------------------------------------------------

  private async accept(body: Record<string, unknown>): Promise<AcceptResponse> {
    const req = body as Partial<AcceptRequest>
    if (
      typeof req.inviteToken !== 'string' ||
      req.inviteToken.trim() === '' ||
      typeof req.keyAlgorithm !== 'string' ||
      typeof req.publicKey !== 'string' ||
      !Array.isArray(req.contacts) ||
      req.contacts.length === 0
    )
      throw badContent()
    const now = this.now()
    const hash = sha256Hex(req.inviteToken.trim())
    const t = this.trustees.find(
      (x) =>
        x.inviteHash === hash &&
        x.status === 'INVITED' &&
        x.inviteUsedAt === null &&
        now < x.inviteExpiresAt,
    )
    if (!t) throw notFound('The invite is invalid, expired or already used')
    const problems: string[] = []
    this.validateContacts('contacts', req.contacts, problems)
    if (problems.length > 0) throw invalid(problems)
    try {
      await parsePublicKey(req.keyAlgorithm, req.publicKey)
    } catch {
      throw invalid([`publicKey is not a valid ${req.keyAlgorithm} X.509 SubjectPublicKeyInfo`])
    }
    const accessToken = newToken()
    const fingerprint = sha256Hex(fromBase64(req.publicKey))
    t.accessHash = sha256Hex(accessToken)
    t.status = 'ACCEPTED'
    t.inviteUsedAt = now
    t.keyAlgorithm = req.keyAlgorithm
    t.publicKey = req.publicKey
    t.keyFingerprint = fingerprint
    t.contacts = req.contacts
    t.acceptedAt = now
    this.record('TRUSTEE', t.id, 'TRUSTEE_ACCEPTED', {
      trusteeId: t.id,
      keyAlgorithm: t.keyAlgorithm,
      fingerprint,
    })
    return {
      trusteeId: t.id,
      vaultId: this.requireVault().id,
      accessToken,
      keyFingerprint: fingerprint,
      scheme: 'Trustee',
    }
  }

  private authenticateTrustee(authorization: string | null): TrusteeRow {
    const token = /^Trustee (.+)$/.exec(authorization ?? '')?.[1]?.trim()
    if (!token || token.length > 200) throw unauthorized()
    const hash = sha256Hex(token)
    const t = this.trustees.find((x) => x.accessHash === hash && x.status !== 'REVOKED')
    if (!t) throw unauthorized()
    return t
  }

  private phase(v: VaultRow): TrusteePhase {
    return v.state === 'RELEASED'
      ? 'RELEASED'
      : v.state === 'RELEASE_PENDING'
        ? 'VOTING'
        : 'WAITING'
  }

  private trusteeMe(t: TrusteeRow): TrusteeStateView {
    const v = this.requireVault()
    const decision = this.votes.get(v.epoch)?.get(t.id) ?? null
    return {
      trusteeId: t.id,
      vaultId: v.id,
      label: t.label,
      status: t.status,
      phase: this.phase(v),
      approvalsRequired: v.policy?.quorum ?? 0,
      shareUploaded: t.sealedShare !== null,
      shareDigest: t.shareDigest,
      shareVaultVersion: t.shareVaultVersion,
      myDecision: v.state === 'RELEASE_PENDING' || v.state === 'RELEASED' ? decision : null,
      keyFingerprint: t.keyFingerprint,
    }
  }

  private confirmShare(t: TrusteeRow, body: Record<string, unknown>): TrusteeStateView {
    if (typeof body.shareDigest !== 'string' || body.shareDigest.trim() === '') throw badContent()
    if (t.sealedShare === null || t.shareDigest === null)
      throw conflict('No share has been uploaded for you yet')
    if (t.shareDigest.toLowerCase() !== body.shareDigest.trim().toLowerCase())
      throw conflict('Digest does not match the share currently stored for you')
    t.status = 'CONFIRMED'
    this.record('TRUSTEE', t.id, 'SHARE_CONFIRMED', { trusteeId: t.id })
    return this.trusteeMe(t)
  }

  private vote(t: TrusteeRow, body: Record<string, unknown>): VoteResponse {
    const decision = body.decision
    if (decision !== 'APPROVE' && decision !== 'DECLINE') throw badContent()
    const v = this.requireVault()
    if (v.state !== 'RELEASE_PENDING') throw conflict('Voting is not open')
    if (!this.holdsShare(t, v))
      throw conflict('You do not hold a share of the current key, so you cannot vote')
    const epochVotes = this.votes.get(v.epoch) ?? new Map<string, Decision>()
    const previous = epochVotes.get(t.id)
    epochVotes.set(t.id, decision)
    this.votes.set(v.epoch, epochVotes)
    this.record('TRUSTEE', t.id, 'APPROVAL_CAST', {
      trusteeId: t.id,
      decision,
      repeat: previous === decision,
      epoch: v.epoch,
    })
    this.advanceVault(v, this.now())
    return { decision, phase: this.phase(v), changed: previous !== decision }
  }

  private requireReleased(): VaultRow {
    const v = this.requireVault()
    if (v.state !== 'RELEASED') throw conflict('The vault has not been released')
    return v
  }

  private fetchShare(t: TrusteeRow): ShareView {
    const v = this.requireReleased()
    if (t.sealedShare === null || !this.holdsShare(t, v))
      throw notFound('No share is stored for you')
    this.record('TRUSTEE', t.id, 'SHARE_FETCHED', { trusteeId: t.id })
    return {
      vaultId: v.id,
      trusteeId: t.id,
      vaultVersion: v.vaultVersion,
      sealedShare: t.sealedShare,
    }
  }

  private fetchTrusteeCiphertext(t: TrusteeRow): TrusteeCiphertextView {
    const v = this.requireReleased()
    this.record('TRUSTEE', t.id, 'CIPHERTEXT_FETCHED', {
      trusteeId: t.id,
      bytes: v.ciphertextBytes,
    })
    return {
      vaultId: v.id,
      vaultVersion: v.vaultVersion,
      ciphertext: v.ciphertext,
      metadata: v.metadata,
      sha256: v.ciphertextSha256,
    }
  }
}
