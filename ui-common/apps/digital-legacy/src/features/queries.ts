import { apiQueryKey, useApiClient, useApiQuery } from '@platform/api-client'
import { useQueryClient } from '@tanstack/react-query'
import { useCallback, useMemo } from 'react'
import { createOwnerApi, type OwnerApi } from '../api/ownerApi'
import { ownerPaths } from '../api/paths'
import type { StateView, TimelineEntry, TrusteeView, VaultSummary } from '../api/types'

/** The typed owner API bound to the current (Firebase-authenticated) client. */
export function useOwnerApi(): OwnerApi {
  const client = useApiClient()
  return useMemo(() => createOwnerApi(client), [client])
}

const REFRESH_MS = 30_000

export const useStateQuery = () =>
  useApiQuery<StateView>(ownerPaths.state, { refetchInterval: REFRESH_MS })
export const useVaultQuery = () => useApiQuery<VaultSummary>(ownerPaths.vault)
export const useTrusteesQuery = () => useApiQuery<TrusteeView[]>(ownerPaths.trustees)
export const useTimelineQuery = (limit = 100) =>
  useApiQuery<TimelineEntry[]>(ownerPaths.timeline, { query: { limit } })

/** Query keys every state-changing owner action refreshes. */
export const OWNER_KEYS = [
  ownerPaths.vault,
  ownerPaths.state,
  ownerPaths.trustees,
  ownerPaths.timeline,
  ownerPaths.ciphertext,
].map((path) => apiQueryKey(path))

/** Refetches everything the owner screens show. */
export function useRefreshOwnerData(): () => Promise<void> {
  const queryClient = useQueryClient()
  return useCallback(async () => {
    await Promise.all(OWNER_KEYS.map((queryKey) => queryClient.invalidateQueries({ queryKey })))
  }, [queryClient])
}
