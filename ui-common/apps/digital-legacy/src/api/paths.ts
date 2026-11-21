/** Every endpoint the app calls, relative to the API base URL (`/api` in dev, proxied to the service). */
const OWNER = '/v1/legacy/vault'
const TRUSTEE = '/v1/legacy/trustee'

export const ownerPaths = {
  vault: OWNER,
  ciphertext: `${OWNER}/ciphertext`,
  policy: `${OWNER}/policy`,
  state: `${OWNER}/state`,
  arm: `${OWNER}/arm`,
  disarm: `${OWNER}/disarm`,
  checkIn: `${OWNER}/checkin`,
  pause: `${OWNER}/pause`,
  resume: `${OWNER}/resume`,
  timeline: `${OWNER}/timeline`,
  auditVerify: `${OWNER}/audit/verify`,
  trustees: `${OWNER}/trustees`,
  trustee: (id: string) => `${OWNER}/trustees/${id}`,
  share: (id: string) => `${OWNER}/trustees/${id}/share`,
} as const

export const trusteePaths = {
  accept: `${TRUSTEE}/accept`,
  me: `${TRUSTEE}/me`,
  confirm: `${TRUSTEE}/share/confirm`,
  approval: `${TRUSTEE}/approval`,
  share: `${TRUSTEE}/share`,
  ciphertext: `${TRUSTEE}/ciphertext`,
} as const
