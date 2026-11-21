import { HttpError, jsonResponse } from './http'
import { callerUid, iso, uuidParam, type MockEnv, type Route } from './route'

export function createAuditRoutes({ state }: MockEnv): Route[] {
  return [
    {
      method: 'GET',
      pattern: /^\/v1\/audit$/,
      handle: (req) => {
        const uid = callerUid(req)
        const householdParam = req.query.get('householdId')
        const householdId = householdParam ? uuidParam(householdParam, 'householdId') : null
        if (
          householdId &&
          !(
            state.households.has(householdId) &&
            state.members.some((m) => m.householdId === householdId && m.uid === uid)
          )
        )
          throw new HttpError(404, 'Household not found')
        const action = req.query.get('action')
        const page = Math.max(Number.parseInt(req.query.get('page') ?? '0', 10) || 0, 0)
        const size = Math.min(
          Math.max(Number.parseInt(req.query.get('size') ?? '50', 10) || 50, 1),
          200,
        )

        const matching = state.audit
          .filter((e) =>
            householdId
              ? e.householdId === householdId
              : e.householdId === null && e.actorUid === uid,
          )
          .filter((e) => !action || e.action === action)
          .sort((a, b) => b.createdAt - a.createdAt || b.seq - a.seq)
        const items = matching.slice(page * size, page * size + size).map((e) => ({
          id: e.id,
          actorUid: e.actorUid,
          householdId: e.householdId,
          action: e.action,
          subjectType: e.subjectType,
          subjectId: e.subjectId,
          details: e.details,
          createdAt: iso(e.createdAt),
        }))
        return jsonResponse({ items, page, size, total: matching.length })
      },
    },
  ]
}
