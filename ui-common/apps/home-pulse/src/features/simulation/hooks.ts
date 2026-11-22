import type { ApiError } from '@platform/api-client'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useApi } from '../../lib/useApi'
import { keys } from '../../lib/queryKeys'
import { simulationApi } from './api'
import type { SimulationRequest, SimulationResult } from './types'

/** Simulating changes devices, readings, health, alerts and reminders, so everything under the appliance refreshes. */
function useRefreshEverything() {
  const queryClient = useQueryClient()
  return () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: keys.appliances }),
      queryClient.invalidateQueries({ queryKey: keys.alerts }),
      queryClient.invalidateQueries({ queryKey: keys.reminders }),
    ])
}

export function useStartSimulation(applianceId: string) {
  const api = useApi(simulationApi)
  const refresh = useRefreshEverything()
  return useMutation<SimulationResult, ApiError, SimulationRequest>({
    mutationFn: (request) => api.start(applianceId, request),
    onSuccess: () => refresh(),
  })
}

export function useStopSimulation(applianceId: string) {
  const api = useApi(simulationApi)
  const refresh = useRefreshEverything()
  return useMutation<void, ApiError, void>({
    mutationFn: () => api.stop(applianceId),
    onSuccess: () => refresh(),
  })
}
