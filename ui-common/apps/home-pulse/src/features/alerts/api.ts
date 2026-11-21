import type { ApiClient } from '@platform/api-client'
import type { AlertDto, AlertFilter } from './types'

/** Translates the inbox filter into the service's `status` / `includeResolved` parameters. */
export function alertQuery(filter: AlertFilter, applianceId?: string) {
  return {
    ...(filter === 'OPEN' || filter === 'ACKNOWLEDGED' || filter === 'RESOLVED'
      ? { status: filter }
      : {}),
    ...(filter === 'ALL' ? { includeResolved: true } : {}),
    ...(applianceId ? { applianceId } : {}),
    limit: 100,
  }
}

export const alertsApi = (client: ApiClient) => ({
  list: (filter: AlertFilter, applianceId?: string, signal?: AbortSignal) =>
    client.get<AlertDto[]>('/v1/alerts', { query: alertQuery(filter, applianceId), signal }),
  acknowledge: (id: string) => client.post<AlertDto>(`/v1/alerts/${id}/ack`),
})
