import { useCallback, useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'

export const RANGES = [
  { id: '1h', label: '1h', long: 'last hour', ms: 3_600_000 },
  { id: '24h', label: '24h', long: 'last 24 hours', ms: 24 * 3_600_000 },
  { id: '7d', label: '7d', long: 'last 7 days', ms: 7 * 24 * 3_600_000 },
  { id: '30d', label: '30d', long: 'last 30 days', ms: 30 * 24 * 3_600_000 },
] as const

export type RangeId = (typeof RANGES)[number]['id']

const MINUTE = 60_000
const roundToMinute = (ms: number) => Math.floor(ms / MINUTE) * MINUTE

export interface UsageWindow {
  range: (typeof RANGES)[number]
  from: string
  to: string
  previousFrom: string
  previousTo: string
  setRange: (id: RangeId) => void
  refresh: () => void
}

/**
 * The selected range (kept in `?range=` so a link or a reload keeps it) and the window it covers. The window ends at a
 * minute-rounded "now" that only moves on refresh or once a minute, so query keys stay stable between renders.
 */
export function useUsageWindow(defaultRange: RangeId = '24h', persistInUrl = true): UsageWindow {
  const [params, setParams] = useSearchParams()
  const [local, setLocal] = useState<RangeId>(defaultRange)
  const fromUrl = params.get('range')
  const id: RangeId =
    persistInUrl && RANGES.some((r) => r.id === fromUrl)
      ? (fromUrl as RangeId)
      : persistInUrl
        ? defaultRange
        : local
  const range = RANGES.find((r) => r.id === id) ?? RANGES[1]
  const [anchor, setAnchor] = useState(() => roundToMinute(Date.now()))

  useEffect(() => {
    const timer = setInterval(() => setAnchor(roundToMinute(Date.now())), MINUTE)
    return () => clearInterval(timer)
  }, [])

  const setRange = useCallback(
    (next: RangeId) => {
      setAnchor(roundToMinute(Date.now()))
      if (persistInUrl) {
        setParams(
          (current) => {
            const n = new URLSearchParams(current)
            n.set('range', next)
            return n
          },
          { replace: true },
        )
      } else setLocal(next)
    },
    [persistInUrl, setParams],
  )
  const refresh = useCallback(() => setAnchor(roundToMinute(Date.now())), [])

  return useMemo(
    () => ({
      range,
      from: new Date(anchor - range.ms).toISOString(),
      to: new Date(anchor).toISOString(),
      previousFrom: new Date(anchor - 2 * range.ms).toISOString(),
      previousTo: new Date(anchor - range.ms).toISOString(),
      setRange,
      refresh,
    }),
    [anchor, range, setRange, refresh],
  )
}
