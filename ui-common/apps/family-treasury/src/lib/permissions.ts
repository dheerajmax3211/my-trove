import type { AccountView, Role } from '../api/types'

/**
 * Client-side mirror of the backend's role rules. The server remains the authority (it answers 403 with a stable
 * code); these helpers only decide what to offer, so people are not shown buttons that cannot work.
 */

export interface Actor {
  uid: string
  role: Role
}

export const isTrusted = (role: Role): boolean => role === 'OWNER' || role === 'APPROVER'
export const canApprove = (role: Role): boolean => isTrusted(role)

/** Backend `HouseholdService.canView`: kids see only their own pot (we also hide household-level accounts). */
export function canView(actor: Actor, account: AccountView): boolean {
  if (actor.role !== 'KID') return true
  return account.ownerUid === actor.uid
}

/** Backend `HouseholdService.canDebit`. */
export function canDebit(actor: Actor, account: AccountView): boolean {
  if (isTrusted(actor.role)) return true
  if (actor.role === 'MEMBER') return account.ownerUid === null || account.ownerUid === actor.uid
  return account.ownerUid === actor.uid
}

/** Moving money out of a household-level account needs a trusted role; out of a pot, the pot rules apply. */
export function canTransferFrom(actor: Actor, account: AccountView): boolean {
  return account.ownerUid === null ? isTrusted(actor.role) : canDebit(actor, account)
}

export interface Capability {
  id: string
  label: string
  roles: Readonly<Record<Role, boolean>>
}

const only = (...allowed: Role[]): Record<Role, boolean> => ({
  OWNER: allowed.includes('OWNER'),
  APPROVER: allowed.includes('APPROVER'),
  MEMBER: allowed.includes('MEMBER'),
  KID: allowed.includes('KID'),
})

/** What each role can do, shown on the Members page. Matches the backend README's role rules. */
export const CAPABILITIES: readonly Capability[] = [
  {
    id: 'own-pot',
    label: 'See and spend from their own pot',
    roles: only('OWNER', 'APPROVER', 'MEMBER', 'KID'),
  },
  {
    id: 'see-all',
    label: 'See the shared pool, every pot and the activity log',
    roles: only('OWNER', 'APPROVER', 'MEMBER'),
  },
  { id: 'deposit', label: 'Record a deposit', roles: only('OWNER', 'APPROVER', 'MEMBER') },
  {
    id: 'spend-pool',
    label: 'Record a spend from the shared pool (large ones need approval)',
    roles: only('OWNER', 'APPROVER', 'MEMBER'),
  },
  {
    id: 'transfer-pool',
    label: 'Move money out of the shared pool',
    roles: only('OWNER', 'APPROVER'),
  },
  {
    id: 'split',
    label: 'Split an expense across several members\u2019 pots',
    roles: only('OWNER', 'APPROVER'),
  },
  {
    id: 'approve',
    label: 'Approve or reject large spends (never your own)',
    roles: only('OWNER', 'APPROVER'),
  },
  { id: 'reverse', label: 'Reverse a ledger entry', roles: only('OWNER', 'APPROVER') },
  { id: 'allowances', label: 'Create and pause allowance schedules', roles: only('OWNER') },
  {
    id: 'members',
    label: 'Add members, change roles and set the approval limit',
    roles: only('OWNER'),
  },
  { id: 'reconcile', label: 'Run the reconciliation check', roles: only('OWNER') },
]
