import type { ApiError } from '@platform/api-client'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { keys } from '../../lib/queryKeys'
import { useApi } from '../../lib/useApi'
import { appliancesApi } from './api'
import type { Appliance, ApplianceInput } from './types'

const REFRESH_INTERVAL_MS = 60_000

export function useAppliances() {
  const api = useApi(appliancesApi)
  return useQuery({ queryKey: keys.appliances, queryFn: ({ signal }) => api.list(signal) })
}

export function useAppliance(id: string) {
  const api = useApi(appliancesApi)
  return useQuery({ queryKey: keys.appliance(id), queryFn: ({ signal }) => api.get(id, signal) })
}

export function useHealth(id: string) {
  const api = useApi(appliancesApi)
  return useQuery({
    queryKey: keys.health(id),
    queryFn: ({ signal }) => api.health(id, signal),
    refetchInterval: REFRESH_INTERVAL_MS,
  })
}

/** Everything that shows appliance data (list, detail, health, devices, readings) plus what depends on it. */
function useRefreshAppliances() {
  const queryClient = useQueryClient()
  return (options: { refetchActive?: boolean } = {}) => {
    const refetchType = options.refetchActive === false ? ('none' as const) : ('active' as const)
    return Promise.all([
      queryClient.invalidateQueries({ queryKey: keys.appliances, refetchType }),
      queryClient.invalidateQueries({ queryKey: keys.alerts, refetchType }),
      queryClient.invalidateQueries({ queryKey: keys.reminders, refetchType }),
    ])
  }
}

export function useCreateAppliance() {
  const api = useApi(appliancesApi)
  const refresh = useRefreshAppliances()
  return useMutation<Appliance, ApiError, ApplianceInput>({
    mutationFn: (input) => api.create(input),
    onSuccess: () => refresh(),
  })
}

export function useUpdateAppliance(id: string) {
  const api = useApi(appliancesApi)
  const refresh = useRefreshAppliances()
  return useMutation<Appliance, ApiError, ApplianceInput>({
    mutationFn: (input) => api.update(id, input),
    onSuccess: () => refresh(),
  })
}

export function useDeleteAppliance(id: string) {
  const api = useApi(appliancesApi)
  const refresh = useRefreshAppliances()
  return useMutation<void, ApiError, void>({
    mutationFn: () => api.remove(id),
    // The detail page is still mounted when this resolves: mark everything stale without refetching the
    // appliance that no longer exists. The list refetches when the user lands on it.
    onSuccess: async () => {
      await refresh({ refetchActive: false })
    },
  })
}

export function useRelearnBaseline(id: string) {
  const api = useApi(appliancesApi)
  const refresh = useRefreshAppliances()
  return useMutation<void, ApiError, void>({
    mutationFn: () => api.relearnBaseline(id),
    onSuccess: () => refresh(),
  })
}
