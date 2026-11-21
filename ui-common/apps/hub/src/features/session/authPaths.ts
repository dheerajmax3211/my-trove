/**
 * auth-service paths. Standalone hub only: the workspace owns sign-in and the profile, and the Household
 * module never calls the auth service. The auth client is bound to `<gateway>/api/auth`.
 */
const AUTH = '/v1'

const seg = encodeURIComponent

export const authPaths = {
  me: `${AUTH}/me`,
  session: `${AUTH}/auth/session`,
  adminUser: (userId: string) => `${AUTH}/admin/users/${seg(userId)}`,
  adminUserRole: (userId: string, role: string) =>
    `${AUTH}/admin/users/${seg(userId)}/roles/${seg(role)}`,
}
