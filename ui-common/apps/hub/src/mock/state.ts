import type { HouseholdRole } from '../features/households/types'
import type { Recurrence, ReminderStatus } from '../features/reminders/types'

export interface MockUser {
  /** Firebase uid: what shared-service stores as owner / member / actor. */
  uid: string
  /** auth-service user id (UUID). */
  userId: string
  email: string
  displayName: string
  roles: Set<string>
}

export interface HouseholdRow {
  id: string
  name: string
  createdBy: string
  createdAt: number
}

export interface MemberRow {
  householdId: string
  uid: string
  role: HouseholdRole
  joinedAt: number
}

export interface InviteRow {
  id: string
  householdId: string
  /** The real service stores only a hash; the mock keeps the code so it can match it. */
  code: string
  role: HouseholdRole
  createdBy: string
  createdAt: number
  expiresAt: number
  usedAt: number | null
}

export interface ReminderRow {
  id: string
  ownerUid: string
  householdId: string | null
  title: string
  dueAt: number
  anchorAt: number
  recurrence: Recurrence | null
  status: ReminderStatus
  lastFiredAt: number | null
  createdAt: number
}

export interface FileRow {
  id: string
  ownerUid: string
  householdId: string | null
  name: string
  contentType: string
  sizeBytes: number
  sha256: string
  createdAt: number
  bytes: Uint8Array<ArrayBuffer>
}

export interface AuditRow {
  seq: number
  id: string
  actorUid: string
  householdId: string | null
  action: string
  subjectType: string
  subjectId: string
  details: Record<string, unknown>
  createdAt: number
}

export interface State {
  users: Map<string, MockUser>
  households: Map<string, HouseholdRow>
  members: MemberRow[]
  invites: InviteRow[]
  reminders: Map<string, ReminderRow>
  files: Map<string, FileRow>
  audit: AuditRow[]
  /** Roles that exist in auth-service's `roles` table. */
  roles: Set<string>
  nextId: () => string
  nextCode: () => string
}

const hex = (n: number, width: number) => n.toString(16).padStart(width, '0')

/** Small seeded PRNG so demo and test runs are repeatable. */
function mulberry32(seed: number): () => number {
  let a = seed
  return () => {
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const CODE_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789_-'

export function createState(): State {
  let counter = 0x100
  const random = mulberry32(20261119)
  return {
    users: new Map(),
    households: new Map(),
    members: [],
    invites: [],
    reminders: new Map(),
    files: new Map(),
    audit: [],
    roles: new Set(['USER', 'ADMIN']),
    nextId: () => `0198b000-0000-7000-8000-${hex((counter += 1), 12)}`,
    // 18 random bytes base64url-encoded are 24 characters long, like the real codes.
    nextCode: () =>
      Array.from({ length: 24 }, () => CODE_ALPHABET[Math.floor(random() * 64)]).join(''),
  }
}

export function recordAudit(
  state: State,
  now: number,
  actorUid: string,
  householdId: string | null,
  action: string,
  subjectType: string,
  subjectId: string,
  details: Record<string, unknown> = {},
): void {
  state.audit.push({
    seq: state.audit.length,
    id: state.nextId(),
    actorUid,
    householdId,
    action,
    subjectType,
    subjectId,
    details,
    createdAt: now,
  })
}
