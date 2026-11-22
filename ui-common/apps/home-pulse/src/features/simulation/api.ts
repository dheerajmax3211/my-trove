import type { ApiClient } from '@platform/api-client'
import type { SimulationRequest, SimulationResult } from './types'

export const simulationApi = (client: ApiClient) => ({
  start: (applianceId: string, request: SimulationRequest) =>
    client.post<SimulationResult>(`/v1/appliances/${applianceId}/simulation`, request),
  stop: (applianceId: string) => client.delete<void>(`/v1/appliances/${applianceId}/simulation`),
})
