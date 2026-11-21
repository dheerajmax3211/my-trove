import type { ApiError } from '@platform/api-client'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { keys } from '../../lib/queryKeys'
import { useApi } from '../../lib/useApi'
import { alertsApi } from './api'
import type { AlertDto, AlertFilter } from './types'

export function useAlerts(filter: AlertFilter, applianceId?: string) {
  const api = useApi(alertsApi)
  return useQuery({
    queryKey: keys.alertList(filter, applianceId),
    queryFn: ({ signal }) => api.list(filter, applianceId, signal),
    refetchInterval: 60_000,
  })
}

export function useAcknowledgeAlert() {
  const api = useApi(alertsApi)
  const queryClient = useQueryClient()
  return useMutation<AlertDto, ApiError, string>({
    mutationFn: (id) => api.acknowledge(id),
    onSuccess: () =>
      Promise.all([
        queryClient.invalidateQueries({ queryKey: keys.alerts }),
        queryClient.invalidateQueries({ queryKey: keys.appliances }),
      ]),
  })
}
