import { apiQueryKey, useApiMutation, useApiQuery } from '@platform/api-client'
import { useQueryClient } from '@tanstack/react-query'
import { authPaths } from '../../api/paths'
import { useProfile } from '../session/profile'
import type { AdminUser } from '../session/types'

export const useAdminUser = (userId: string | null) =>
  useApiQuery<AdminUser>(authPaths.adminUser(userId ?? ''), {
    enabled: userId !== null,
    retry: false,
  })

/** Grant (PUT) or revoke (DELETE) one role. The response is the updated user; it replaces the cached lookup. */
export function useRoleChange(userId: string, action: 'grant' | 'revoke') {
  const queryClient = useQueryClient()
  const profile = useProfile()
  return useApiMutation<AdminUser, { role: string }>({
    method: action === 'grant' ? 'PUT' : 'DELETE',
    path: (v) => authPaths.adminUserRole(userId, v.role),
    body: () => undefined,
    onSuccess: async (user) => {
      queryClient.setQueryData(apiQueryKey(authPaths.adminUser(userId)), user)
      if (user.id === profile.id)
        await queryClient.invalidateQueries({ queryKey: apiQueryKey(authPaths.me) })
    },
  })
}
