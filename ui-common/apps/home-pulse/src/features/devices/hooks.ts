import type { ApiError } from '@platform/api-client'
import { useMutation, useQueries, useQuery, useQueryClient } from '@tanstack/react-query'
import { keys } from '../../lib/queryKeys'
import { useApi } from '../../lib/useApi'
import { devicesApi } from './api'
import type { RegisteredDevice } from './types'

export function useDevices(applianceId: string, enabled = true) {
  const api = useApi(devicesApi)
  return useQuery({
    queryKey: keys.devices(applianceId),
    enabled,
    queryFn: ({ signal }) => api.list(applianceId, signal),
  })
}

/** Devices for several appliances at once (the service lists them per appliance). */
export function useDevicesFor(applianceIds: readonly string[]) {
  const api = useApi(devicesApi)
  return useQueries({
    queries: applianceIds.map((id) => ({
      queryKey: keys.devices(id),
      queryFn: ({ signal }: { signal: AbortSignal }) => api.list(id, signal),
    })),
  })
}

function useRefreshAppliance() {
  const queryClient = useQueryClient()
  return () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: keys.appliances }),
      queryClient.invalidateQueries({ queryKey: keys.alerts }),
    ])
}

/**
 * The result carries the one-time ingestion token. It lives only in the mutation result: the caller shows it,
 * then calls `reset()` so it does not stay in memory.
 */
export function useRegisterDevice(applianceId: string) {
  const api = useApi(devicesApi)
  const refresh = useRefreshAppliance()
  return useMutation<RegisteredDevice, ApiError, string>({
    mutationFn: (label) => api.register(applianceId, label),
    gcTime: 0,
    onSuccess: () => refresh(),
  })
}

export function useRevokeDevice() {
  const api = useApi(devicesApi)
  const refresh = useRefreshAppliance()
  return useMutation<void, ApiError, string>({
    mutationFn: (deviceId) => api.revoke(deviceId),
    onSuccess: () => refresh(),
  })
}
