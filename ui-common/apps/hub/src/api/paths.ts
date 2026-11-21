/**
 * Every backend path the hub calls. The API client's base URL is the gateway root (`/api` by
 * default), so the first segment picks the service: `/auth/...` is auth-service (:8081) and
 * `/shared/...` is shared-service (:8082). The Vite dev proxy and a production gateway both strip it.
 */
const AUTH = '/auth/v1'
const SHARED = '/shared/v1'

const seg = encodeURIComponent

export const authPaths = {
  me: `${AUTH}/me`,
  session: `${AUTH}/auth/session`,
  adminUser: (userId: string) => `${AUTH}/admin/users/${seg(userId)}`,
  adminUserRole: (userId: string, role: string) =>
    `${AUTH}/admin/users/${seg(userId)}/roles/${seg(role)}`,
}

export const sharedPaths = {
  households: `${SHARED}/households`,
  household: (id: string) => `${SHARED}/households/${seg(id)}`,
  householdInvites: (id: string) => `${SHARED}/households/${seg(id)}/invites`,
  householdInvite: (id: string, inviteId: string) =>
    `${SHARED}/households/${seg(id)}/invites/${seg(inviteId)}`,
  acceptInvite: `${SHARED}/invites/accept`,
  leaveHousehold: (id: string) => `${SHARED}/households/${seg(id)}/leave`,
  householdMember: (id: string, uid: string) =>
    `${SHARED}/households/${seg(id)}/members/${seg(uid)}`,
  householdMemberRole: (id: string, uid: string) =>
    `${SHARED}/households/${seg(id)}/members/${seg(uid)}/role`,
  reminders: `${SHARED}/reminders`,
  reminder: (id: string) => `${SHARED}/reminders/${seg(id)}`,
  cancelReminder: (id: string) => `${SHARED}/reminders/${seg(id)}/cancel`,
  files: `${SHARED}/files`,
  file: (id: string) => `${SHARED}/files/${seg(id)}`,
  fileDownloadLink: (id: string) => `${SHARED}/files/${seg(id)}/download-link`,
  audit: `${SHARED}/audit`,
}
