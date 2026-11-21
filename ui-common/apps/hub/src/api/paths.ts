/**
 * Every shared-service path the Household module calls. The module's API client is bound to the
 * service itself (`<gateway>/api/shared`), so paths start at `/v1`. The module never talks to another
 * service: sign-in and profile belong to the workspace (or, standalone, to the hub's own shell).
 */
const SHARED = '/v1'

const seg = encodeURIComponent

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
