import { useQuery } from '@tanstack/react-query'
import { useClock } from '../../lib/clock'
import { keys } from '../../lib/queryKeys'
import { useApi } from '../../lib/useApi'
import { readingsApi } from './api'
import { RANGE_OPTIONS, type RangeKey } from './types'

const CURRENT_DRAW_WINDOW_MS = 15 * 60_000

/** Readings for the chart. The window is computed when the request is made, so a refetch is always fresh. */
export function useReadings(applianceId: string, range: RangeKey, enabled = true) {
  const api = useApi(readingsApi)
  const clock = useClock()
  return useQuery({
    queryKey: keys.readings(applianceId, range),
    enabled,
    queryFn: ({ signal }) => {
      const to = clock()
      const ms = RANGE_OPTIONS.find((r) => r.key === range)?.ms ?? 24 * 60 * 60_000
      return api.series(applianceId, { from: new Date(to.getTime() - ms), to }, signal)
    },
  })
}

const TREND_WINDOW_MS = 24 * 60 * 60_000

/** Hourly average draw for the last 24 hours: the shape behind a card's sparkline, not a measurement. */
export function useTrend(applianceId: string, enabled = true) {
  const api = useApi(readingsApi)
  const clock = useClock()
  return useQuery({
    queryKey: keys.trend(applianceId),
    enabled,
    refetchInterval: 5 * 60_000,
    queryFn: async ({ signal }) => {
      const to = clock()
      const series = await api.series(
        applianceId,
        { from: new Date(to.getTime() - TREND_WINDOW_MS), to, resolution: 'ONE_HOUR' },
        signal,
      )
      return series.points.map((p) => p.avgWatts)
    },
  })
}

/** The most recent one-minute reading from the last 15 minutes, or `null` when the appliance has gone quiet. */
export function useCurrentDraw(applianceId: string, enabled = true) {
  const api = useApi(readingsApi)
  const clock = useClock()
  return useQuery({
    queryKey: keys.currentDraw(applianceId),
    enabled,
    refetchInterval: 60_000,
    queryFn: async ({ signal }) => {
      const to = clock()
      const series = await api.series(
        applianceId,
        {
          from: new Date(to.getTime() - CURRENT_DRAW_WINDOW_MS),
          to,
          resolution: 'ONE_MINUTE',
        },
        signal,
      )
      const last = series.points[series.points.length - 1]
      return last ? { watts: last.avgWatts, at: last.ts } : null
    },
  })
}
