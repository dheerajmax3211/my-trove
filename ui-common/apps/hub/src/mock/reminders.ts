import type { Recurrence, ReminderStatus } from '../features/reminders/types'
import { HttpError, jsonResponse } from './http'
import {
  callerUid,
  intInRange,
  invalid,
  iso,
  jsonObject,
  notBlank,
  uuidParam,
  type MockEnv,
  type MockRequest,
  type Route,
} from './route'
import { nextOccurrenceAfter } from './schedule'
import { recordAudit, type ReminderRow } from './state'

const STATUSES: readonly ReminderStatus[] = ['ACTIVE', 'COMPLETED', 'CANCELLED']
const UNITS = ['DAILY', 'WEEKLY', 'MONTHLY'] as const
const notReadable = () => new HttpError(400, 'Failed to read request')

function parseInstant(value: unknown): number {
  if (typeof value !== 'string') throw invalid()
  const ms = Date.parse(value)
  if (Number.isNaN(ms)) throw notReadable()
  return ms
}

function parseRecurrence(value: unknown): Recurrence | null {
  if (value == null) return null
  if (typeof value !== 'object' || Array.isArray(value)) throw notReadable()
  const { unit, interval } = value as Record<string, unknown>
  if (!UNITS.some((u) => u === unit)) throw invalid()
  return {
    unit: unit as Recurrence['unit'],
    interval: interval == null ? 1 : intInRange(interval, 1, 365),
  }
}

export function createReminderRoutes({ state, now }: MockEnv) {
  const memberOf = (uid: string, householdId: string) =>
    state.members.find((m) => m.householdId === householdId && m.uid === uid)

  const requireHouseholdMember = (uid: string, householdId: string) => {
    if (!memberOf(uid, householdId) || !state.households.has(householdId))
      throw new HttpError(404, 'Household not found')
  }

  const view = (r: ReminderRow) => ({
    id: r.id,
    ownerUid: r.ownerUid,
    householdId: r.householdId,
    title: r.title,
    dueAt: iso(r.dueAt),
    recurrence: r.recurrence,
    status: r.status,
    lastFiredAt: r.lastFiredAt === null ? null : iso(r.lastFiredAt),
    createdAt: iso(r.createdAt),
  })

  const loadVisible = (uid: string, id: string): ReminderRow => {
    const r = state.reminders.get(id)
    const visible =
      r && (r.householdId === null ? r.ownerUid === uid : memberOf(uid, r.householdId))
    if (!r || !visible) throw new HttpError(404, 'Reminder not found')
    return r
  }

  /** The creator, or a household OWNER. */
  const loadModifiable = (uid: string, id: string): ReminderRow => {
    const r = loadVisible(uid, id)
    if (r.ownerUid !== uid && r.householdId && memberOf(uid, r.householdId)?.role !== 'OWNER')
      throw new HttpError(403, 'Requires household role OWNER')
    return r
  }

  const audit = (uid: string, r: ReminderRow, action: string, details: Record<string, unknown>) =>
    recordAudit(state, now(), uid, r.householdId, action, 'reminder', r.id, details)

  const idOf = (req: MockRequest) => uuidParam(req.params[0], 'id')

  const routes: Route[] = [
    {
      method: 'POST',
      pattern: /^\/v1\/reminders$/,
      handle: (req) => {
        const uid = callerUid(req)
        const body = jsonObject(req.body)
        const title = notBlank(body.title, 300).trim()
        const dueAt = parseInstant(body.dueAt)
        const recurrence = parseRecurrence(body.recurrence)
        const householdId =
          body.householdId == null
            ? null
            : uuidParam(
                typeof body.householdId === 'string' ? body.householdId : null,
                'householdId',
              )
        if (householdId) requireHouseholdMember(uid, householdId)
        const r: ReminderRow = {
          id: state.nextId(),
          ownerUid: uid,
          householdId,
          title,
          dueAt,
          anchorAt: dueAt,
          recurrence,
          status: 'ACTIVE',
          lastFiredAt: null,
          createdAt: now(),
        }
        state.reminders.set(r.id, r)
        audit(uid, r, 'reminder.created', { title })
        return jsonResponse(view(r), 201)
      },
    },
    {
      method: 'GET',
      pattern: /^\/v1\/reminders$/,
      handle: (req) => {
        const uid = callerUid(req)
        const householdParam = req.query.get('householdId')
        const statusParam = req.query.get('status')
        if (statusParam && !STATUSES.some((s) => s === statusParam))
          throw new HttpError(400, 'Invalid value for status')
        const householdId = householdParam ? uuidParam(householdParam, 'householdId') : null
        if (householdId) requireHouseholdMember(uid, householdId)
        const list = [...state.reminders.values()]
          .filter((r) =>
            householdId
              ? r.householdId === householdId
              : r.householdId === null
                ? r.ownerUid === uid
                : memberOf(uid, r.householdId),
          )
          .filter((r) => !statusParam || r.status === statusParam)
          .sort((a, b) => a.dueAt - b.dueAt || a.id.localeCompare(b.id))
          .slice(0, 500)
          .map(view)
        return jsonResponse(list)
      },
    },
    {
      method: 'PUT',
      pattern: /^\/v1\/reminders\/([^/]+)$/,
      handle: (req) => {
        const uid = callerUid(req)
        const id = idOf(req)
        const body = jsonObject(req.body)
        const title = notBlank(body.title, 300).trim()
        const dueAt = parseInstant(body.dueAt)
        const recurrence = parseRecurrence(body.recurrence)
        const r = loadModifiable(uid, id)
        if (r.status !== 'ACTIVE') throw new HttpError(409, 'Only active reminders can be changed')
        Object.assign(r, { title, dueAt, anchorAt: dueAt, recurrence })
        audit(uid, r, 'reminder.updated', { title })
        return jsonResponse(view(r))
      },
    },
    {
      method: 'POST',
      pattern: /^\/v1\/reminders\/([^/]+)\/cancel$/,
      handle: (req) => {
        const uid = callerUid(req)
        const r = loadModifiable(uid, idOf(req))
        if (r.status === 'ACTIVE') {
          r.status = 'CANCELLED'
          audit(uid, r, 'reminder.cancelled', {})
        }
        return jsonResponse(view(r))
      },
    },
  ]

  /**
   * What the real scheduler does every few seconds: fire due reminders. A one-off becomes
   * COMPLETED; a recurring one moves to its next occurrence strictly after now.
   */
  const fireDue = () => {
    const at = now()
    for (const r of state.reminders.values()) {
      if (r.status !== 'ACTIVE' || r.dueAt > at) continue
      r.lastFiredAt = at
      if (r.recurrence) r.dueAt = nextOccurrenceAfter(r.recurrence, r.anchorAt, at)
      else r.status = 'COMPLETED'
    }
  }

  return { routes, fireDue }
}
