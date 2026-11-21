import type { HouseholdRole } from '../features/households/types'
import { HttpError, jsonResponse, noContent } from './http'
import {
  callerUid,
  intInRange,
  iso,
  jsonObject,
  notBlank,
  optionalJsonObject,
  uuidParam,
  type MockEnv,
  type Route,
} from './route'
import { recordAudit, type HouseholdRow, type MemberRow } from './state'

const HOUR_MS = 3_600_000
const DEFAULT_INVITE_TTL_HOURS = 24 * 7

const isRole = (value: unknown): value is HouseholdRole => value === 'OWNER' || value === 'MEMBER'

export function createHouseholdRoutes({ state, now }: MockEnv): Route[] {
  const audit = (
    actor: string,
    householdId: string | null,
    action: string,
    subjectType: string,
    subjectId: string,
    details: Record<string, unknown> = {},
  ) => recordAudit(state, now(), actor, householdId, action, subjectType, subjectId, details)

  const membership = (uid: string, householdId: string): MemberRow | undefined =>
    state.members.find((m) => m.householdId === householdId && m.uid === uid)

  /** Non-member or unknown household: 404, so ids cannot be probed. */
  const requireMember = (uid: string, householdId: string): MemberRow => {
    const m = membership(uid, householdId)
    if (!m || !state.households.has(householdId)) throw new HttpError(404, 'Household not found')
    return m
  }

  const requireOwner = (uid: string, householdId: string): MemberRow => {
    const m = requireMember(uid, householdId)
    if (m.role !== 'OWNER') throw new HttpError(403, 'Requires household role OWNER')
    return m
  }

  const ensureNotLastOwner = (householdId: string, uid: string, role: HouseholdRole) => {
    if (role !== 'OWNER') return
    const others = state.members.filter(
      (m) => m.householdId === householdId && m.role === 'OWNER' && m.uid !== uid,
    )
    if (others.length === 0)
      throw new HttpError(
        409,
        'The last owner cannot leave or be demoted; promote another owner or delete the household',
      )
  }

  const removeMemberRow = (householdId: string, uid: string) => {
    state.members = state.members.filter((m) => !(m.householdId === householdId && m.uid === uid))
  }

  const householdView = (h: HouseholdRow, role: HouseholdRole) => ({
    id: h.id,
    name: h.name,
    role,
    createdAt: iso(h.createdAt),
  })

  const memberView = (m: MemberRow) => ({ uid: m.uid, role: m.role, joinedAt: iso(m.joinedAt) })

  return [
    {
      method: 'POST',
      pattern: /^\/v1\/households$/,
      handle: (req) => {
        const uid = callerUid(req)
        const name = notBlank(jsonObject(req.body).name, 200).trim()
        const h: HouseholdRow = { id: state.nextId(), name, createdBy: uid, createdAt: now() }
        state.households.set(h.id, h)
        state.members.push({ householdId: h.id, uid, role: 'OWNER', joinedAt: h.createdAt })
        audit(uid, h.id, 'household.created', 'household', h.id, { name })
        return jsonResponse(householdView(h, 'OWNER'), 201)
      },
    },
    {
      method: 'GET',
      pattern: /^\/v1\/households$/,
      handle: (req) => {
        const uid = callerUid(req)
        const mine = state.members
          .filter((m) => m.uid === uid)
          .flatMap((m) => {
            const h = state.households.get(m.householdId)
            return h ? [householdView(h, m.role)] : []
          })
          .sort((a, b) => a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id))
        return jsonResponse(mine)
      },
    },
    {
      method: 'GET',
      pattern: /^\/v1\/households\/([^/]+)$/,
      handle: (req) => {
        const uid = callerUid(req)
        const id = uuidParam(req.params[0], 'id')
        const caller = requireMember(uid, id)
        const h = state.households.get(id)!
        const members = state.members
          .filter((m) => m.householdId === id)
          .sort((a, b) => a.joinedAt - b.joinedAt || a.uid.localeCompare(b.uid))
          .map(memberView)
        return jsonResponse({
          id,
          name: h.name,
          createdAt: iso(h.createdAt),
          callerRole: caller.role,
          members,
        })
      },
    },
    {
      method: 'DELETE',
      pattern: /^\/v1\/households\/([^/]+)$/,
      handle: (req) => {
        const uid = callerUid(req)
        const id = uuidParam(req.params[0], 'id')
        requireOwner(uid, id)
        for (const [reminderId, r] of state.reminders) {
          if (r.householdId === id) state.reminders.delete(reminderId)
        }
        for (const [fileId, f] of state.files) {
          if (f.householdId === id) state.files.delete(fileId)
        }
        state.invites = state.invites.filter((i) => i.householdId !== id)
        state.members = state.members.filter((m) => m.householdId !== id)
        state.households.delete(id)
        audit(uid, id, 'household.deleted', 'household', id)
        return noContent()
      },
    },
    {
      method: 'POST',
      pattern: /^\/v1\/households\/([^/]+)\/invites$/,
      handle: (req) => {
        const uid = callerUid(req)
        const id = uuidParam(req.params[0], 'id')
        const body = optionalJsonObject(req.body)
        if (body?.role !== undefined && body.role !== null && !isRole(body.role))
          throw new HttpError(400, 'Failed to read request')
        const ttlHours =
          body?.ttlHours == null ? DEFAULT_INVITE_TTL_HOURS : intInRange(body.ttlHours, 1, 720)
        requireOwner(uid, id)
        const role: HouseholdRole = isRole(body?.role) ? body.role : 'MEMBER'
        const createdAt = now()
        const invite = {
          id: state.nextId(),
          householdId: id,
          code: state.nextCode(),
          role,
          createdBy: uid,
          createdAt,
          expiresAt: createdAt + ttlHours * HOUR_MS,
          usedAt: null,
        }
        state.invites.push(invite)
        audit(uid, id, 'invite.created', 'invite', invite.id, {
          role,
          expiresAt: iso(invite.expiresAt),
        })
        return jsonResponse(
          { id: invite.id, code: invite.code, role, expiresAt: iso(invite.expiresAt) },
          201,
        )
      },
    },
    {
      method: 'GET',
      pattern: /^\/v1\/households\/([^/]+)\/invites$/,
      handle: (req) => {
        const uid = callerUid(req)
        const id = uuidParam(req.params[0], 'id')
        requireOwner(uid, id)
        const pending = state.invites
          .filter((i) => i.householdId === id && i.usedAt === null && i.expiresAt > now())
          .sort((a, b) => a.createdAt - b.createdAt)
          .map((i) => ({
            id: i.id,
            role: i.role,
            createdBy: i.createdBy,
            createdAt: iso(i.createdAt),
            expiresAt: iso(i.expiresAt),
          }))
        return jsonResponse(pending)
      },
    },
    {
      method: 'DELETE',
      pattern: /^\/v1\/households\/([^/]+)\/invites\/([^/]+)$/,
      handle: (req) => {
        const uid = callerUid(req)
        const id = uuidParam(req.params[0], 'id')
        const inviteId = uuidParam(req.params[1], 'inviteId')
        requireOwner(uid, id)
        const before = state.invites.length
        state.invites = state.invites.filter(
          (i) => !(i.id === inviteId && i.householdId === id && i.usedAt === null),
        )
        if (state.invites.length === before) throw new HttpError(404, 'Invite not found')
        audit(uid, id, 'invite.revoked', 'invite', inviteId)
        return noContent()
      },
    },
    {
      method: 'POST',
      pattern: /^\/v1\/invites\/accept$/,
      handle: (req) => {
        const uid = callerUid(req)
        const code = notBlank(jsonObject(req.body).code, 200).trim()
        const invite = state.invites.find(
          (i) => i.code === code && i.usedAt === null && i.expiresAt > now(),
        )
        if (!invite) throw new HttpError(410, 'Invite code is invalid, already used or expired')
        // Already a member: the real service rolls back, so the code is not consumed.
        if (membership(uid, invite.householdId))
          throw new HttpError(409, 'You are already a member of this household')
        invite.usedAt = now()
        state.members.push({
          householdId: invite.householdId,
          uid,
          role: invite.role,
          joinedAt: now(),
        })
        audit(uid, invite.householdId, 'member.joined', 'member', uid, {
          role: invite.role,
          inviteId: invite.id,
        })
        return jsonResponse(householdView(state.households.get(invite.householdId)!, invite.role))
      },
    },
    {
      method: 'POST',
      pattern: /^\/v1\/households\/([^/]+)\/leave$/,
      handle: (req) => {
        const uid = callerUid(req)
        const id = uuidParam(req.params[0], 'id')
        const caller = requireMember(uid, id)
        ensureNotLastOwner(id, uid, caller.role)
        removeMemberRow(id, uid)
        audit(uid, id, 'member.left', 'member', uid)
        return noContent()
      },
    },
    {
      method: 'DELETE',
      pattern: /^\/v1\/households\/([^/]+)\/members\/([^/]+)$/,
      handle: (req) => {
        const actor = callerUid(req)
        const id = uuidParam(req.params[0], 'id')
        const targetUid = req.params[1] ?? ''
        requireOwner(actor, id)
        const target = membership(targetUid, id)
        if (!target) throw new HttpError(404, 'Member not found')
        ensureNotLastOwner(id, targetUid, target.role)
        removeMemberRow(id, targetUid)
        audit(actor, id, 'member.removed', 'member', targetUid)
        return noContent()
      },
    },
    {
      method: 'PUT',
      pattern: /^\/v1\/households\/([^/]+)\/members\/([^/]+)\/role$/,
      handle: (req) => {
        const actor = callerUid(req)
        const id = uuidParam(req.params[0], 'id')
        const targetUid = req.params[1] ?? ''
        const { role } = jsonObject(req.body)
        if (!isRole(role)) throw new HttpError(400, 'Invalid request content.')
        requireOwner(actor, id)
        const target = membership(targetUid, id)
        if (!target) throw new HttpError(404, 'Member not found')
        if (target.role !== role) {
          if (role === 'MEMBER') ensureNotLastOwner(id, targetUid, target.role)
          const from = target.role
          target.role = role
          audit(actor, id, 'member.role_changed', 'member', targetUid, { from, to: role })
        }
        return jsonResponse(memberView(target))
      },
    },
  ]
}
