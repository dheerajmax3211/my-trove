import type { HouseholdRole, Member } from './types'

export const LAST_OWNER_REASON =
  'A household always needs at least one owner. Make someone else an owner first.'

export const ownerCount = (members: readonly Member[]): number =>
  members.filter((m) => m.role === 'OWNER').length

export const isLastOwner = (members: readonly Member[], uid: string): boolean =>
  members.some((m) => m.uid === uid && m.role === 'OWNER') && ownerCount(members) === 1

export interface Allowance {
  allowed: boolean
  /** Why not, in a sentence the UI can show next to the disabled control. */
  reason?: string
}

/** Owners can change anyone's role, but the only owner cannot be demoted. */
export function canChangeRole(
  callerRole: HouseholdRole,
  members: readonly Member[],
  target: Member,
): Allowance {
  if (callerRole !== 'OWNER') return { allowed: false, reason: 'Only owners can change roles.' }
  if (isLastOwner(members, target.uid)) return { allowed: false, reason: LAST_OWNER_REASON }
  return { allowed: true }
}

/** Owners can remove other members, but never the only owner. Leaving yourself is a separate action. */
export function canRemoveMember(
  callerRole: HouseholdRole,
  members: readonly Member[],
  target: Member,
): Allowance {
  if (callerRole !== 'OWNER') return { allowed: false, reason: 'Only owners can remove members.' }
  if (isLastOwner(members, target.uid)) return { allowed: false, reason: LAST_OWNER_REASON }
  return { allowed: true }
}

export function canLeave(members: readonly Member[], callerUid: string): Allowance {
  if (isLastOwner(members, callerUid))
    return {
      allowed: false,
      reason:
        'You are the only owner. Make another member an owner before you leave, or delete the household.',
    }
  return { allowed: true }
}
