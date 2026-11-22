import type {
  CsvImportResult,
  MeterReadingResult,
  ReadingPoint,
  Resolution,
} from '../features/readings/types'
import { bucketMs } from './signal'
import { BadRequest } from './validation'

/**
 * The demo's copy of the manual-readings rules in ManualReadingsService and CsvReadings: the same conversions, limits
 * and messages, so the demo and the tests behave like the real service for entries made by hand.
 */

export const MIN = 60_000
const DAY = 24 * 60 * MIN
/** The ingest window: readings older than this are rejected, and so are readings too far in the future. */
export const MAX_AGE_MS = 30 * DAY
export const MAX_FUTURE_MS = 5 * MIN
export const CSV_MAX_ROWS = 10_000
const MAX_WATTS = 1_000_000
const MAX_PROBLEMS_SHOWN = 5

/** A minute reading kept for a manual device. */
export interface ManualSample {
  ms: number
  watts: number
}

/** A running meter total the owner entered. */
export interface MeterTotal {
  ms: number
  kwh: number
}

/** A refusal the real service would answer with 409. */
export class ManualConflict extends Error {}

export const averageWatts = (deltaKwh: number, minutes: number): number =>
  (deltaKwh * 60_000) / minutes

const ISO_WITH_ZONE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:\d{2})$/

/** Parses one timestamp with a zone. A timestamp without one is refused, not guessed. */
export function parseZonedMs(text: string): number | null {
  if (!ISO_WITH_ZONE.test(text)) return null
  const ms = Date.parse(text)
  return Number.isNaN(ms) ? null : ms
}

/** Mirrors CsvReadings.parse: every row is valid or the whole file is refused, listing the first problems. */
export function parseCsv(csv: string): ManualSample[] {
  const rows: ManualSample[] = []
  const problems: string[] = []
  const lines = csv.split(/\r?\n/)
  let firstContentLine = true
  for (let i = 0; i < lines.length; i += 1) {
    const line = (lines[i] ?? '').trim()
    const lineNo = i + 1
    if (line === '') continue
    if (firstContentLine) {
      firstContentLine = false
      // ISO timestamps start with a digit; a header starts with a letter.
      if (/^[A-Za-z]/.test(line)) continue
    }
    if (rows.length + problems.length >= CSV_MAX_ROWS)
      throw new BadRequest(`A file can hold at most ${CSV_MAX_ROWS} readings. Import it in parts`)
    const cells = line.split(',')
    if (cells.length !== 2) {
      problems.push(`line ${lineNo}: expected two columns, timestamp,watts`)
      continue
    }
    const ms = parseZonedMs((cells[0] ?? '').trim())
    if (ms === null) {
      problems.push(
        `line ${lineNo}: the timestamp must be ISO 8601 with a zone, such as 2026-11-19T10:00:00Z`,
      )
      continue
    }
    const watts = Number((cells[1] ?? '').trim())
    if ((cells[1] ?? '').trim() === '' || Number.isNaN(watts)) {
      problems.push(`line ${lineNo}: watts must be a number`)
      continue
    }
    if (!Number.isFinite(watts) || watts < 0 || watts > MAX_WATTS) {
      problems.push(`line ${lineNo}: watts must be between 0 and ${MAX_WATTS}`)
      continue
    }
    rows.push({ ms, watts })
  }
  if (problems.length > 0) {
    const shown = problems.slice(0, MAX_PROBLEMS_SHOWN)
    const more =
      problems.length > shown.length ? `; and ${problems.length - shown.length} more` : ''
    throw new BadRequest(`Nothing was imported. ${shown.join('; ')}${more}`)
  }
  if (rows.length === 0)
    throw new BadRequest(
      'The file has no readings. Each line needs a timestamp and watts, such as 2026-11-19T10:00:00Z,118.4',
    )
  return rows
}

/** Ingest window check, as IngestService applies it. */
const inWindow = (ms: number, nowMs: number): boolean =>
  ms <= nowMs + MAX_FUTURE_MS && ms >= nowMs - MAX_AGE_MS

export interface ManualState {
  samples: ManualSample[]
  totals: MeterTotal[]
}

/**
 * Mirrors ManualReadingsService.recordMeterTotal. Mutates the state when the total is accepted.
 * @throws BadRequest for a time in the future, ManualConflict when the total cannot be placed
 */
export function recordMeterTotal(
  state: ManualState,
  input: { kwh: number; atMs?: number },
  nowMs: number,
): MeterReadingResult {
  const at = Math.floor((input.atMs ?? nowMs) / MIN) * MIN
  if (at > nowMs + MAX_FUTURE_MS) throw new BadRequest('at must not be in the future')
  const last = state.totals[state.totals.length - 1]
  if (!last) {
    state.totals.push({ ms: at, kwh: input.kwh })
    return {
      outcome: 'BASELINE',
      at: new Date(at).toISOString(),
      previousAt: null,
      energyKwh: 0,
      intervalMinutes: 0,
      averageWatts: null,
      minutesStored: 0,
      minutesRejected: 0,
    }
  }
  if (at <= last.ms)
    throw new ManualConflict(
      `Enter readings in time order. The last total is from ${new Date(last.ms).toISOString()}, so a total at or before that time cannot be placed`,
    )
  if (input.kwh < last.kwh)
    throw new ManualConflict(
      `The total is lower than the last one (${last.kwh} kWh at ${new Date(last.ms).toISOString()}). A meter's total only goes up. If the meter was reset or replaced, stop entering readings by hand and start again`,
    )

  const minutes = Math.floor((at - last.ms) / MIN)
  const delta = input.kwh - last.kwh
  const watts = averageWatts(delta, minutes)
  const oldest = nowMs - MAX_AGE_MS
  const tooOld = Math.min(minutes, Math.max(0, Math.floor((oldest - last.ms) / MIN)))
  let stored = 0
  for (let k = tooOld + 1; k <= minutes; k += 1) {
    const ms = last.ms + k * MIN
    if (inWindow(ms, nowMs)) {
      state.samples.push({ ms, watts })
      stored += 1
    }
  }
  state.totals.push({ ms: at, kwh: input.kwh })
  return {
    outcome: 'RECORDED',
    at: new Date(at).toISOString(),
    previousAt: new Date(last.ms).toISOString(),
    energyKwh: round(delta, 3),
    intervalMinutes: minutes,
    averageWatts: round(watts, 1),
    minutesStored: stored,
    minutesRejected: minutes - stored,
  }
}

/** Mirrors ManualReadingsService.importCsv. Duplicates are minutes already stored. */
export function importCsv(state: ManualState, csv: string, nowMs: number): CsvImportResult {
  const rows = parseCsv(csv)
  const have = new Set(state.samples.map((s) => s.ms))
  let accepted = 0
  let duplicates = 0
  let rejected = 0
  for (const row of rows) {
    if (!inWindow(row.ms, nowMs)) {
      rejected += 1
    } else if (have.has(row.ms)) {
      duplicates += 1
    } else {
      have.add(row.ms)
      state.samples.push(row)
      accepted += 1
    }
  }
  return { rows: rows.length, accepted, duplicates, rejected }
}

/** Points for a manual device at the requested resolution. Each minute reading is its own point at RAW. */
export function manualSeries(
  samples: readonly ManualSample[],
  start: number,
  end: number,
  resolution: Resolution,
): ReadingPoint[] {
  const size = resolution === 'RAW' ? MIN : bucketMs(resolution)
  const buckets = new Map<number, number[]>()
  for (const s of samples) {
    if (s.ms < start || s.ms >= end) continue
    const key = Math.floor(s.ms / size) * size
    const list = buckets.get(key) ?? []
    list.push(s.watts)
    buckets.set(key, list)
  }
  return [...buckets.entries()]
    .sort(([a], [b]) => a - b)
    .map(([key, watts]) => ({
      ts: new Date(key).toISOString(),
      avgWatts: round(watts.reduce((a, b) => a + b, 0) / watts.length, 1),
      minWatts: round(Math.min(...watts), 1),
      maxWatts: round(Math.max(...watts), 1),
      avgVolts: null,
      avgAmps: null,
      samples: watts.length,
    }))
}

/** Last 24 hours as the health view reports them: energy is the sum of the minute averages. */
export function manualLast24h(samples: readonly ManualSample[], nowMs: number) {
  const from = nowMs - DAY
  const inRange = samples.filter((s) => s.ms >= from && s.ms < nowMs)
  if (inRange.length === 0)
    return { avgWatts: 0, maxWatts: 0, energyKwh: 0, dutyPct: null, minutesWithData: 0 }
  const sum = inRange.reduce((acc, s) => acc + s.watts, 0)
  return {
    avgWatts: round(sum / inRange.length, 1),
    maxWatts: round(Math.max(...inRange.map((s) => s.watts)), 1),
    energyKwh: round(sum / 60 / 1000, 3),
    dutyPct: null,
    minutesWithData: inRange.length,
  }
}

const round = (n: number, digits: number): number => {
  const f = 10 ** digits
  return Math.round(n * f) / f
}
