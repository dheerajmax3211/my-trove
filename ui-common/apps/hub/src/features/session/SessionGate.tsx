import { apiQueryKey, useApiClient, useApiQuery, type ApiError } from '@platform/api-client'
import { useAuth } from '@platform/auth-web'
import { Spinner } from '@platform/ui'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import type { ReactNode } from 'react'
import { authPaths } from '../../api/paths'
import { ErrorState } from '../../components/ErrorState'
import { ProfileContext } from './profile'
import type { Profile } from './types'

/**
 * Runs the sign-in session call once (`POST /v1/auth/session` provisions the user and records the
 * login), then serves `/v1/me`. Children render only once the profile and its roles are known.
 */
export function SessionGate({ children }: { children: ReactNode }) {
  const client = useApiClient()
  const queryClient = useQueryClient()
  const { user } = useAuth()

  const session = useQuery<Profile, ApiError>({
    queryKey: ['session', user?.uid],
    queryFn: async () => {
      const profile = await client.post<Profile>(authPaths.session)
      queryClient.setQueryData(apiQueryKey(authPaths.me), profile)
      return profile
    },
    staleTime: Infinity,
    retry: false,
  })
  const me = useApiQuery<Profile>(authPaths.me, { enabled: session.isSuccess })

  if (session.isError)
    return (
      <div className="hub-center">
        <ErrorState error={session.error} onRetry={() => void session.refetch()} />
      </div>
    )
  if (me.isError && !me.data)
    return (
      <div className="hub-center">
        <ErrorState error={me.error} onRetry={() => void me.refetch()} />
      </div>
    )
  if (!me.data)
    return (
      <div className="hub-center">
        <Spinner size={32} label="Loading your profile" />
      </div>
    )
  return <ProfileContext value={me.data}>{children}</ProfileContext>
}
