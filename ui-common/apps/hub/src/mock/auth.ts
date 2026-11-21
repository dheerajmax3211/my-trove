import { isUuid } from '../lib/format'
import { HttpError, jsonResponse } from './http'
import { callerUid, type MockEnv, type MockRequest, type Route } from './route'
import type { MockUser } from './state'

const profile = (u: MockUser) => ({
  id: u.userId,
  email: u.email,
  displayName: u.displayName,
  roles: [...u.roles].sort(),
})

const adminUser = (u: MockUser) => ({ ...profile(u), firebaseUid: u.uid })

/** auth-service rejects with Boot's default error body, which carries no message. */
const boot = (status: number, message: string) => new HttpError(status, message, 'boot')

export function createAuthRoutes({ state }: MockEnv): Route[] {
  /** First sight of a Firebase uid provisions a local user with the USER role. */
  const provision = (uid: string): MockUser => {
    let user = state.users.get(uid)
    if (!user) {
      user = {
        uid,
        userId: state.nextId(),
        email: `${uid}@example.test`,
        displayName: uid,
        roles: new Set(['USER']),
      }
      state.users.set(uid, user)
    }
    user.roles.add('USER')
    return user
  }

  const requireAdmin = (req: MockRequest): MockUser => {
    const user = provision(callerUid(req))
    if (!user.roles.has('ADMIN')) throw new HttpError(403, 'Forbidden', 'empty')
    return user
  }

  const findById = (id: string): MockUser | undefined =>
    [...state.users.values()].find((u) => u.userId === id)

  const targetAndRole = (req: MockRequest) => {
    const id = req.params[0] ?? ''
    if (!isUuid(id)) throw boot(400, 'Bad id')
    const target = findById(id.toLowerCase())
    if (!target) throw boot(404, 'User not found')
    const role = req.params[1] ?? ''
    if (!state.roles.has(role)) throw boot(404, 'Unknown role')
    return { target, role }
  }

  return [
    {
      method: 'GET',
      pattern: /^\/v1\/me$/,
      handle: (req) => jsonResponse(profile(provision(callerUid(req)))),
    },
    {
      method: 'POST',
      pattern: /^\/v1\/auth\/session$/,
      handle: (req) => jsonResponse(profile(provision(callerUid(req)))),
    },
    {
      method: 'GET',
      pattern: /^\/v1\/admin\/users\/([^/]+)$/,
      handle: (req) => {
        requireAdmin(req)
        const id = req.params[0] ?? ''
        if (!isUuid(id)) throw boot(400, 'Bad id')
        const target = findById(id.toLowerCase())
        if (!target) throw boot(404, 'User not found')
        return jsonResponse(adminUser(target))
      },
    },
    {
      method: 'PUT',
      pattern: /^\/v1\/admin\/users\/([^/]+)\/roles\/([^/]+)$/,
      handle: (req) => {
        requireAdmin(req)
        const { target, role } = targetAndRole(req)
        target.roles.add(role)
        return jsonResponse(adminUser(target))
      },
    },
    {
      method: 'DELETE',
      pattern: /^\/v1\/admin\/users\/([^/]+)\/roles\/([^/]+)$/,
      handle: (req) => {
        const actor = requireAdmin(req)
        const { target, role } = targetAndRole(req)
        if (role === 'USER') throw boot(400, 'USER role cannot be revoked')
        if (actor.userId === target.userId && role === 'ADMIN')
          throw boot(400, 'Admins cannot revoke their own ADMIN role')
        target.roles.delete(role)
        return jsonResponse(adminUser(target))
      },
    },
  ]
}
