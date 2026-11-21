import type { ApiClient } from '@platform/api-client'
import type { Appliance, ApplianceHealth, ApplianceInput } from './types'

export const appliancesApi = (client: ApiClient) => ({
  list: (signal?: AbortSignal) => client.get<Appliance[]>('/v1/appliances', { signal }),
  get: (id: string, signal?: AbortSignal) =>
    client.get<Appliance>(`/v1/appliances/${id}`, { signal }),
  create: (input: ApplianceInput) => client.post<Appliance>('/v1/appliances', input),
  update: (id: string, input: ApplianceInput) =>
    client.put<Appliance>(`/v1/appliances/${id}`, input),
  remove: (id: string) => client.delete<void>(`/v1/appliances/${id}`),
  health: (id: string, signal?: AbortSignal) =>
    client.get<ApplianceHealth>(`/v1/appliances/${id}/health`, { signal }),
  relearnBaseline: (id: string) => client.post<void>(`/v1/appliances/${id}/baseline/relearn`),
})
