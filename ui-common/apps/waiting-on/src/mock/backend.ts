/**
 * In-memory stand-in for the waiting-on service. It speaks the real contract: the same paths,
 * status codes, RFC 9457 problem documents and validation rules as ItemController / ItemService,
 * including "another user's item is a 404" and the service's generic 400 for bean-validation failures.
 */
import { addDays, calendarDaysBetween, parseCalendarDate, pluralDays } from '../lib/dates'
import type { Clock } from '../lib/clock'
import {
  ITEM_CATEGORIES,
  ITEM_STATUSES,
  TONES,
  isTerminal,
  type EventType,
  type FollowUp,
  type Item,
  type ItemCategory,
  type ItemStatus,
  type NextAction,
  type Plan,
  type Stage,
  type TimelineEvent,
  type Tone,
} from '../features/items/api/types'
import { defaultPlan, validatePlan } from '../features/items/logic/schedule'
import { draftLetter } from './letters'
import { classifyReply } from './reply'

const REPLY_DOMAIN = 'reply.waiting-on.local'
const DRAFT_NOTE =
  'Template wording only; it cites well known consumer-rights instruments as examples and is not legal advice. Check what applies in your jurisdiction before sending.'
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/** The signed-in user the mock treats as the caller. Other owners' items are invisible (404). */
export const MOCK_USER_UID = 'demo-user'

export interface StoredEvent extends TimelineEvent {
  itemId: string
}

export type StoredItem = Omit<Item, 'followUp' | 'replyAddress'> & {
  ownerUid: string
  replyToken: string
  /** Workflow state: which stage it is in and how many days it has been snoozed in total. */
  stage: Stage
  snoozedDays: number
}

export interface SeedEntry {
  item: StoredItem
  events: StoredEvent[]
}

export interface MockBackendOptions {
  clock: Clock
  /** Simulated network delay per request. Default 0. */
  latencyMs?: number
  seed?: readonly SeedEntry[]
}

class Problem extends Error {
  constructor(
    readonly status: number,
    readonly title: string,
    readonly detail: string,
  ) {
    super(detail)
  }
}

const GENERIC_VALIDATION = new Problem(400, 'Bad Request', 'Invalid request content.')
const notFound = () => new Problem(404, 'Not Found', 'Item not found')

const json = (body: unknown, status = 200, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json', ...headers },
  })

const problemResponse = (p: Problem, instance: string) =>
  new Response(
    JSON.stringify({
      type: 'about:blank',
      title: p.title,
      status: p.status,
      detail: p.detail,
      instance,
    }),
    { status: p.status, headers: { 'content-type': 'application/problem+json' } },
  )

const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v)

const WORKFLOW_STAGE_FOR_STATUS: Record<ItemStatus, Stage> = {
  OPEN: 'AWAITING_NUDGE',
  NUDGED: 'NUDGED',
  ESCALATED: 'ESCALATED',
  RESOLVED: 'RESOLVED',
  EXPIRED: 'EXPIRED',
  CANCELLED: 'CANCELLED',
}
export const stageForStatus = (status: ItemStatus): Stage => WORKFLOW_STAGE_FOR_STATUS[status]

export function createMockBackend(options: MockBackendOptions): { fetch: typeof fetch } {
  const { clock, latencyMs = 0 } = options
  const items = new Map<string, StoredItem>()
  const events: StoredEvent[] = []
  let sequence = 100_000

  for (const entry of options.seed ?? []) {
    items.set(entry.item.id, { ...entry.item })
    events.push(...entry.events)
  }

  const nextId = (prefix: string) => {
    sequence += 1
    return `${prefix}-${String(sequence).padStart(12, '0')}`
  }

  const mine = (id: string, uid: string): StoredItem => {
    if (!UUID.test(id)) throw new Problem(400, 'Bad Request', 'Invalid UUID string: ' + id)
    const item = items.get(id)
    if (!item || item.ownerUid !== uid) throw notFound()
    return item
  }

  const followUpFor = (item: StoredItem): FollowUp | null => {
    if (isTerminal(item.status)) return null
    const created = new Date(item.createdAt)
    const { plan: p, snoozedDays: s } = item
    const due = (days: number) => addDays(created, days + s).toISOString()
    let nextAction: NextAction
    let nextActionAt: string
    switch (item.stage) {
      case 'AWAITING_NUDGE':
        nextAction = 'NUDGE'
        nextActionAt = due(p.nudgeAfterDays)
        break
      case 'NUDGED':
        nextAction = 'ESCALATE'
        nextActionAt = due(p.escalateAfterDays)
        break
      case 'ESCALATED':
        nextAction = p.finalNoticeAfterDays > 0 ? 'FINAL_NOTICE' : 'EXPIRE'
        nextActionAt = due(p.finalNoticeAfterDays > 0 ? p.finalNoticeAfterDays : p.expireAfterDays)
        break
      default:
        nextAction = 'EXPIRE'
        nextActionAt = due(p.expireAfterDays)
    }
    return { stage: item.stage, nextAction, nextActionAt, snoozedDays: s }
  }

  const view = (item: StoredItem, withFollowUp: boolean): Item => {
    const { ownerUid: _o, replyToken, stage: _s, snoozedDays: _d, ...rest } = item
    return {
      ...rest,
      replyAddress: `waiting+${replyToken}@${REPLY_DOMAIN}`,
      followUp: withFollowUp ? followUpFor(item) : null,
    }
  }

  const record = (item: StoredItem, type: EventType, summary: string, detail: string | null) => {
    events.push({
      id: nextId('e0000000-0000-4000-8000'),
      itemId: item.id,
      type,
      summary,
      detail,
      occurredAt: clock().toISOString(),
    })
  }

  const parseCreate = (body: unknown): Omit<StoredItem, 'ownerUid'> => {
    if (!isRecord(body)) throw new Problem(400, 'Bad Request', 'Failed to read request')
    const text = (v: unknown, max: number, required: boolean): string | null => {
      if (v === undefined || v === null) {
        if (required) throw GENERIC_VALIDATION
        return null
      }
      if (typeof v !== 'string' || v.length > max || (required && v.trim() === ''))
        throw GENERIC_VALIDATION
      return v
    }
    const title = text(body.title, 200, true) as string
    const counterparty = text(body.counterparty, 200, true) as string
    const email = text(body.counterpartyEmail, 320, false)
    if (email && !/^[^\s@]+@[^\s@]+$/.test(email)) throw GENERIC_VALIDATION
    if (!ITEM_CATEGORIES.includes(body.category as ItemCategory)) {
      throw body.category === undefined || body.category === null
        ? GENERIC_VALIDATION
        : new Problem(400, 'Bad Request', 'Failed to read request')
    }
    const category = body.category as ItemCategory
    let amount: number | null = null
    if (body.amount !== undefined && body.amount !== null) {
      if (
        typeof body.amount !== 'number' ||
        body.amount < 0 ||
        !/^\d{1,12}(\.\d{1,2})?$/.test(String(body.amount))
      )
        throw GENERIC_VALIDATION
      amount = body.amount
    }
    let currency: string | null = null
    if (body.currency !== undefined && body.currency !== null) {
      if (typeof body.currency !== 'string' || !/^[A-Z]{3}$/.test(body.currency))
        throw GENERIC_VALIDATION
      currency = body.currency
    }
    if (typeof body.expectedBy !== 'string') throw GENERIC_VALIDATION
    const expected = parseCalendarDate(body.expectedBy)
    if (!expected) throw new Problem(400, 'Bad Request', 'Failed to read request')

    let plan: Plan
    if (body.plan === undefined || body.plan === null) {
      plan = defaultPlan(category, calendarDaysBetween(clock(), expected))
    } else {
      const p = body.plan
      const field = (k: string, min: number): number => {
        const v = isRecord(p) ? p[k] : undefined
        if (typeof v !== 'number' || !Number.isInteger(v) || v < min) throw GENERIC_VALIDATION
        return v
      }
      plan = {
        nudgeAfterDays: field('nudgeAfterDays', 1),
        escalateAfterDays: field('escalateAfterDays', 1),
        finalNoticeAfterDays: field('finalNoticeAfterDays', 0),
        expireAfterDays: field('expireAfterDays', 1),
      }
    }
    if (amount !== null && currency === null)
      throw new Problem(400, 'Bad Request', 'currency is required when amount is given')
    const planErrors = Object.values(validatePlan(plan))
    if (body.plan && planErrors.length > 0)
      throw new Problem(400, 'Bad Request', planErrorMessage(plan))

    const now = clock().toISOString()
    const id = nextId('00000000-0000-4000-8000')
    return {
      id,
      title: title.trim(),
      counterparty: counterparty.trim(),
      counterpartyEmail: email || null,
      category,
      amount,
      currency,
      expectedBy: body.expectedBy,
      status: 'OPEN',
      outcome: null,
      plan,
      createdAt: now,
      updatedAt: now,
      closedAt: null,
      replyToken: `a${String(sequence).padStart(19, '0')}`,
      stage: 'AWAITING_NUDGE',
      snoozedDays: 0,
    }
  }

  const close = (
    item: StoredItem,
    status: ItemStatus,
    outcome: string,
    type: EventType,
    summary: string,
  ) => {
    if (isTerminal(item.status))
      throw new Problem(409, 'Conflict', `Item is already ${item.status}`)
    const now = clock().toISOString()
    item.status = status
    item.stage = stageForStatus(status)
    item.outcome = outcome
    item.closedAt = now
    item.updatedAt = now
    record(item, type, summary, outcome)
  }

  const handle = (
    method: string,
    path: string,
    params: URLSearchParams,
    body: unknown,
    uid: string,
  ): Response => {
    if (path === '/v1/items' && method === 'POST') {
      const created = { ...parseCreate(body), ownerUid: uid }
      items.set(created.id, created)
      const p = created.plan
      record(
        created,
        'CREATED',
        `Now waiting on ${created.counterparty} for: ${created.title}`,
        `Expected by ${created.expectedBy}. Nudge after day ${p.nudgeAfterDays}, escalate after day ${p.escalateAfterDays}` +
          (p.finalNoticeAfterDays > 0 ? `, final notice after day ${p.finalNoticeAfterDays}` : '') +
          `, expire after day ${p.expireAfterDays}.`,
      )
      return json(view(created, false), 201, { location: `/v1/items/${created.id}` })
    }

    if (path === '/v1/items' && method === 'GET') {
      const statuses = params.getAll('status')
      if (statuses.some((s) => !ITEM_STATUSES.includes(s as ItemStatus)))
        throw new Problem(400, 'Bad Request', "Method parameter 'status': Failed to convert value")
      const limit = Math.min(Math.max(Number(params.get('limit') ?? 50) || 50, 1), 100)
      const offset = Math.max(Number(params.get('offset') ?? 0) || 0, 0)
      const rows = [...items.values()]
        .filter((i) => i.ownerUid === uid && (statuses.length === 0 || statuses.includes(i.status)))
        .sort(
          (a, b) =>
            a.expectedBy.localeCompare(b.expectedBy) || a.createdAt.localeCompare(b.createdAt),
        )
        .slice(offset, offset + limit)
      return json(rows.map((i) => view(i, false)))
    }

    const match =
      /^\/v1\/items\/([^/]+)(?:\/(timeline|draft|resolve|snooze|cancel|replies))?$/.exec(path)
    if (!match)
      throw new Problem(404, 'Not Found', 'No static resource ' + path.replace(/^\//, '') + '.')
    const [, id = '', action] = match
    const item = mine(id, uid)

    if (!action && method === 'GET') return json(view(item, true))
    if (action === 'timeline' && method === 'GET')
      return json(events.filter((e) => e.itemId === item.id).map(({ itemId: _i, ...e }) => e))
    if (action === 'draft' && method === 'GET') {
      const tone = params.get('tone') ?? 'ESCALATION'
      if (!TONES.includes(tone as Tone))
        throw new Problem(400, 'Bad Request', "Method parameter 'tone': Failed to convert value")
      const letter = draftLetter(tone as Tone, {
        title: item.title,
        counterparty: item.counterparty,
        category: item.category,
        amount: item.amount,
        currency: item.currency,
        expectedBy: parseCalendarDate(item.expectedBy) ?? clock(),
        createdOn: new Date(item.createdAt),
        today: clock(),
        replyTo: `waiting+${item.replyToken}@${REPLY_DOMAIN}`,
      })
      return json({ tone, ...letter, note: DRAFT_NOTE })
    }
    if (action === 'resolve' && method === 'POST') {
      const outcome = isRecord(body) && typeof body.outcome === 'string' ? body.outcome : ''
      if (outcome.length > 1000) throw GENERIC_VALIDATION
      close(item, 'RESOLVED', outcome.trim() || 'Resolved', 'RESOLVED', 'Marked as resolved')
      return json(view(item, false))
    }
    if (action === 'cancel' && method === 'POST') {
      close(item, 'CANCELLED', 'Cancelled by owner', 'CANCELLED', 'Tracking cancelled')
      return json(view(item, false))
    }
    if (action === 'replies' && method === 'POST') {
      const text = isRecord(body) && typeof body.text === 'string' ? body.text.trim() : ''
      if (text === '' || text.length > 20000) throw GENERIC_VALIDATION
      const from =
        isRecord(body) && typeof body.from === 'string' && body.from.trim() !== ''
          ? body.from.trim()
          : item.counterparty
      const subject = isRecord(body) && typeof body.subject === 'string' ? body.subject : ''
      const classification = classifyReply(`${subject}\n${text}`)
      record(
        item,
        'REPLY_RECEIVED',
        `Reply from ${from} classified as ${classification}`,
        `Subject: ${subject}\n\n${text.slice(0, 2000)}`,
      )
      item.updatedAt = clock().toISOString()
      const applied = !isTerminal(item.status)
      if (applied) {
        if (classification === 'PAID')
          close(
            item,
            'RESOLVED',
            'Counterparty reply indicates it was paid / approved',
            'RESOLVED',
            'Marked as resolved',
          )
        else if (classification === 'REJECTED') {
          item.status = 'ESCALATED'
          item.stage = stageForStatus('ESCALATED')
          record(item, 'ESCALATION_DRAFTED', 'Escalation drafted after a refusal', null)
        } else if (classification === 'NEEDS_INFO') item.snoozedDays += 7
      }
      return json({ matched: true, applied, itemId: item.id, classification })
    }
    if (action === 'snooze' && method === 'POST') {
      const days = isRecord(body) ? body.days : undefined
      if (typeof days !== 'number' || !Number.isInteger(days) || days < 1 || days > 90)
        throw GENERIC_VALIDATION
      if (isTerminal(item.status))
        throw new Problem(409, 'Conflict', `Item is already ${item.status}`)
      record(item, 'SNOOZED', `Follow-ups postponed by ${pluralDays(days)}`, null)
      item.snoozedDays += days
      item.updatedAt = clock().toISOString()
      return json(view(item, true))
    }
    throw new Problem(405, 'Method Not Allowed', `Request method '${method}' is not supported`)
  }

  const mockFetch = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const url = new URL(
      typeof input === 'string' ? input : input instanceof URL ? input.href : input.url,
      'http://localhost',
    )
    const method = (init?.method ?? 'GET').toUpperCase()
    const path = url.pathname.replace(/^\/api/, '')
    const token = new Headers(init?.headers).get('authorization')?.replace(/^Bearer /, '')

    if (latencyMs > 0) await new Promise((resolve) => setTimeout(resolve, latencyMs))
    else await Promise.resolve()

    if (!token || token.endsWith('-expired'))
      return problemResponse(
        new Problem(401, 'Unauthorized', 'A valid Firebase ID token is required.'),
        path,
      )

    let body: unknown
    if (typeof init?.body === 'string' && init.body !== '') {
      try {
        body = JSON.parse(init.body)
      } catch {
        return problemResponse(new Problem(400, 'Bad Request', 'Failed to read request'), path)
      }
    }
    try {
      return handle(method, path, url.searchParams, body, MOCK_USER_UID)
    } catch (error) {
      if (error instanceof Problem) return problemResponse(error, path)
      throw error
    }
  }

  return { fetch: mockFetch }
}

function planErrorMessage(p: Plan): string {
  if (p.escalateAfterDays <= p.nudgeAfterDays)
    return 'escalateAfterDays must be after nudgeAfterDays'
  if (p.finalNoticeAfterDays !== 0 && p.finalNoticeAfterDays <= p.escalateAfterDays)
    return 'finalNoticeAfterDays must be after escalateAfterDays'
  return 'expireAfterDays must be after the last escalation stage'
}
