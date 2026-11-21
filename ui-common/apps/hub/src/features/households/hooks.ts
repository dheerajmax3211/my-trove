import { apiQueryKey, useApiMutation, useApiQuery } from '@platform/api-client'
import { sharedPaths } from '../../api/paths'
import type {
  Household,
  HouseholdDetail,
  HouseholdRole,
  Invite,
  InviteCreated,
  Member,
} from './types'

/** Everything a membership change can make stale: lists, the household itself, its invites, activity. */
const refresh = (id?: string) => [
  apiQueryKey(sharedPaths.households),
  ...(id
    ? [apiQueryKey(sharedPaths.household(id)), apiQueryKey(sharedPaths.householdInvites(id))]
    : []),
  apiQueryKey(sharedPaths.audit),
]

export const useHouseholds = () => useApiQuery<Household[]>(sharedPaths.households)

export const useHousehold = (id: string) => useApiQuery<HouseholdDetail>(sharedPaths.household(id))

export const useInvites = (id: string, enabled: boolean) =>
  useApiQuery<Invite[]>(sharedPaths.householdInvites(id), { enabled })

export const useCreateHousehold = () =>
  useApiMutation<Household, { name: string }>({
    path: sharedPaths.households,
    invalidate: refresh(),
  })

export const useAcceptInvite = () =>
  useApiMutation<Household, { code: string }>({
    path: sharedPaths.acceptInvite,
    invalidate: refresh(),
  })

export const useCreateInvite = (id: string) =>
  useApiMutation<InviteCreated, { role: HouseholdRole; ttlHours: number }>({
    path: sharedPaths.householdInvites(id),
    invalidate: refresh(id),
  })

export const useRevokeInvite = (id: string) =>
  useApiMutation<void, { inviteId: string }>({
    method: 'DELETE',
    path: (v) => sharedPaths.householdInvite(id, v.inviteId),
    invalidate: refresh(id),
  })

export const useChangeRole = (id: string) =>
  useApiMutation<Member, { uid: string; role: HouseholdRole }>({
    method: 'PUT',
    path: (v) => sharedPaths.householdMemberRole(id, v.uid),
    body: (v) => ({ role: v.role }),
    invalidate: refresh(id),
  })

export const useRemoveMember = (id: string) =>
  useApiMutation<void, { uid: string }>({
    method: 'DELETE',
    path: (v) => sharedPaths.householdMember(id, v.uid),
    invalidate: refresh(id),
  })

export const useLeaveHousehold = (id: string) =>
  useApiMutation<void>({ path: sharedPaths.leaveHousehold(id), invalidate: refresh() })

export const useDeleteHousehold = (id: string) =>
  useApiMutation<void>({
    method: 'DELETE',
    path: sharedPaths.household(id),
    invalidate: [
      apiQueryKey(sharedPaths.households),
      apiQueryKey(sharedPaths.reminders),
      apiQueryKey(sharedPaths.files),
      apiQueryKey(sharedPaths.audit),
    ],
  })
