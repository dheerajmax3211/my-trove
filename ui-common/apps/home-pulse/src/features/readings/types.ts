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

/**
 * Where an appliance's energy numbers come from. Mirrors ReadingSource.
 * DEVICE: a smart plug or meter reports watts with its device token.
 * MANUAL: the owner entered meter totals or imported a CSV; each point is the average over the interval entered.
 * SIMULATED: the built-in simulator made the numbers. They are not the appliance's.
 */
export type ReadingSource = 'DEVICE' | 'MANUAL' | 'SIMULATED'

export interface ReadingSeries {
  applianceId: string
  from: string
  to: string
  resolution: Resolution
  points: ReadingPoint[]
  /** The source of the numbers, or null when the appliance has no live source. */
  source?: ReadingSource | null
  /** The readings come from the built-in simulator. */
  simulated?: boolean
}

/** Mirrors MeterReadingRequest. `kwh` is the meter's running total; `at` defaults to now on the server. */
export interface MeterReadingInput {
  kwh: number
  at?: string
}

/**
 * Mirrors ManualReadingResult. The first total only sets the starting point (BASELINE). Each later one turns the
 * energy used since the previous total into one average-power value per minute (RECORDED).
 */
export interface MeterReadingResult {
  outcome: 'BASELINE' | 'RECORDED'
  at: string
  previousAt: string | null
  /** Energy since the previous total. 0 for a baseline. */
  energyKwh: number
  intervalMinutes: number
  /** Average power over the interval. Null for a baseline. */
  averageWatts: number | null
  /** Minutes stored as readings. */
  minutesStored: number
  /** Minutes not stored because they are older than the service accepts (30 days). */
  minutesRejected: number
}

/** Mirrors CsvImportResult. */
export interface CsvImportResult {
  rows: number
  accepted: number
  duplicates: number
  rejected: number
}

export const RANGES = ['hour', 'day', 'week', 'month'] as const
export type RangeKey = (typeof RANGES)[number]

export const RANGE_OPTIONS: readonly { key: RangeKey; label: string; ms: number }[] = [
  { key: 'hour', label: 'Hour', ms: 60 * 60_000 },
  { key: 'day', label: 'Day', ms: 24 * 60 * 60_000 },
  { key: 'week', label: 'Week', ms: 7 * 24 * 60 * 60_000 },
  { key: 'month', label: 'Month', ms: 30 * 24 * 60 * 60_000 },
]
