import type { ApiClient } from '@platform/api-client'
import type {
  CsvImportResult,
  MeterReadingInput,
  MeterReadingResult,
  ReadingSeries,
  Resolution,
} from './types'

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
  /** Enter the meter's running total in kWh (the number on a plug's display or the utility meter). */
  recordMeterTotal: (applianceId: string, input: MeterReadingInput) =>
    client.post<MeterReadingResult>(`/v1/appliances/${applianceId}/meter-readings`, input),
  /** Import `timestamp,watts` rows, one per line, as pasted or read from a file. */
  importCsv: (applianceId: string, csv: string) =>
    client.post<CsvImportResult>(`/v1/appliances/${applianceId}/readings/import`, { csv }),
})
