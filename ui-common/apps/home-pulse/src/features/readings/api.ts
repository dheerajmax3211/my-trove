import type { ApiClient } from '@platform/api-client'
import type { ReadingSeries, Resolution } from './types'

export interface ReadingsQuery {
  from: Date
  to: Date
  /** Leave unset to let the service pick the bucket size for the range. */
  resolution?: Resolution
}

export const readingsApi = (client: ApiClient) => ({
  series: (applianceId: string, query: ReadingsQuery, signal?: AbortSignal) =>
    client.get<ReadingSeries>(`/v1/appliances/${applianceId}/readings`, {
      query: {
        from: query.from.toISOString(),
        to: query.to.toISOString(),
        resolution: query.resolution,
      },
      signal,
    }),
})
