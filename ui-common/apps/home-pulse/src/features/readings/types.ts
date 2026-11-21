/** Mirrors ReadingsService.Series, ReadingPoint and Resolution. */
export type Resolution = 'RAW' | 'ONE_MINUTE' | 'ONE_HOUR' | 'ONE_DAY'

export interface ReadingPoint {
  /** Start of the bucket (the reading itself for RAW). */
  ts: string
  avgWatts: number
  minWatts: number
  maxWatts: number
  avgVolts: number | null
  avgAmps: number | null
  samples: number
}

export interface ReadingSeries {
  applianceId: string
  from: string
  to: string
  resolution: Resolution
  points: ReadingPoint[]
}

export const RANGES = ['hour', 'day', 'week', 'month'] as const
export type RangeKey = (typeof RANGES)[number]

export const RANGE_OPTIONS: readonly { key: RangeKey; label: string; ms: number }[] = [
  { key: 'hour', label: 'Hour', ms: 60 * 60_000 },
  { key: 'day', label: 'Day', ms: 24 * 60 * 60_000 },
  { key: 'week', label: 'Week', ms: 7 * 24 * 60 * 60_000 },
  { key: 'month', label: 'Month', ms: 30 * 24 * 60 * 60_000 },
]
