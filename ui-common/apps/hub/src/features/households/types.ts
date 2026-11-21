export type HouseholdRole = 'OWNER' | 'MEMBER'

export interface Household {
  id: string
  name: string
  role: HouseholdRole
  createdAt: string
}

export interface Member {
  uid: string
  role: HouseholdRole
  joinedAt: string
}

export interface HouseholdDetail {
  id: string
  name: string
  createdAt: string
  callerRole: HouseholdRole
  members: Member[]
}

/** `code` is returned exactly once, when the invite is created. */
export interface InviteCreated {
  id: string
  code: string
  role: HouseholdRole
  expiresAt: string
}

export interface Invite {
  id: string
  role: HouseholdRole
  createdBy: string
  createdAt: string
  expiresAt: string
}
