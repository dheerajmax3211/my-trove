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
/** Mirrors CsvReadings.MAX_INTERVAL_MINUTES: a longer gap is kept as a total, never spread over invented minutes. */
export const MAX_INTERVAL_MINUTES = 120
const MAX_WATTS = 1_000_000
const MAX_VOLTS = 1_000
const MAX_AMPS = 1_000
const MAX_KWH = 1_000_000_000
const MAX_PROBLEMS_SHOWN = 5

/** A minute reading kept for a manual device. */
export interface ManualSample {
  ms: number
  watts: number
}

/** A parsed CSV row. A kWh row has intervalMinutes > 0 and stands for the minutes (ms - n, ms]. */
export interface CsvRow {
  ms: number
  watts: number
  intervalMinutes: number
}

/** A running meter total the owner entered. */
export interface MeterTotal {
  ms: number
  kwh: number
}

/** A refusal the real service would answer with 409. */
export class ManualConflict extends Error {}

/** A problem with one row, collected per line like the service does. */
class RowError extends Error {}

export const averageWatts = (deltaKwh: number, minutes: number): number =>
  (deltaKwh * 60_000) / minutes

const ISO_WITH_ZONE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:\d{2})$/
const NO_ZONE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d+)?)?$/

/** Parses one timestamp with a zone. A timestamp without one is refused, not guessed. */
export function parseZonedMs(text: string): number | null {
  if (!ISO_WITH_ZONE.test(text)) return null
  const ms = Date.parse(text)
  return Number.isNaN(ms) ? null : ms
}

/** Java's Instant.toString for whole seconds: 2031-01-15T10:00:00Z. */
const instantText = (ms: number): string => new Date(ms).toISOString().replace('.000Z', 'Z')

const floorMinute = (ms: number): number => Math.floor(ms / MIN) * MIN

const describeMinutes = (minutes: number): string =>
  minutes % 60 === 0 ? `${minutes / 60} hours` : `${minutes} minutes`

function timestampOf(text: string): number {
  const ms = parseZonedMs(text)
  if (ms !== null) return ms
  if (NO_ZONE.test(text))
    throw new RowError(
      'the timestamp has no time zone. Add Z or an offset such as +01:00, for example 2031-01-15T10:00:00Z',
    )
  throw new RowError('the timestamp is not ISO 8601, for example 2031-01-15T10:00:00Z')
}

function numberOf(text: string, name: string, min: number, max: number): number {
  const trimmed = text.trim()
  const value = Number(trimmed)
  if (trimmed === '' || (Number.isNaN(value) && trimmed.toLowerCase() !== 'nan'))
    throw new RowError(`${name} must be a number`)
  if (!Number.isFinite(value) || value < min || value > max)
    throw new RowError(`${name} must be between ${min} and ${max}`)
  return value
}

type Unit = 'WATTS' | 'KWH'

/** Which column holds what (-1 when absent). `header` is the text used in messages. */
interface Columns {
  ts: number
  value: number
  unit: Unit
  volts: number
  amps: number
  count: number
  header: string
}

const DEFAULT_COLUMNS: Columns = {
  ts: 0,
  value: 1,
  unit: 'WATTS',
  volts: -1,
  amps: -1,
  count: 2,
  header: 'timestamp,watts',
}

/** Mirrors Columns.fromHeader: the header names decide the columns, in any order and case. */
function columnsFromHeader(line: string): Columns {
  const names = line.split(',')
  const found: { ts?: number; watts?: number; kwh?: number; volts?: number; amps?: number } = {}
  const unknown: string[] = []
  const place = (key: keyof typeof found, index: number, name: string) => {
    if (found[key] !== undefined)
      throw new BadRequest(`Nothing was imported. The header names the column '${name}' twice`)
    found[key] = index
  }
  names.forEach((raw, index) => {
    const name = raw.trim()
    switch (name.toLowerCase()) {
      case 'timestamp':
      case 'time':
      case 'ts':
        place('ts', index, name)
        break
      case 'watts':
        place('watts', index, name)
        break
      case 'kwh':
        place('kwh', index, name)
        break
      case 'volts':
      case 'voltage':
        place('volts', index, name)
        break
      case 'amps':
      case 'current':
        place('amps', index, name)
        break
      default:
        unknown.push(`'${name}'`)
    }
  })
  if (unknown.length > 0)
    throw new BadRequest(
      `Nothing was imported. The header has unknown column ${unknown.join(', ')}. The columns it understands are timestamp, watts or kwh, volts, amps`,
    )
  if (found.ts === undefined)
    throw new BadRequest('Nothing was imported. The header needs a timestamp column')
  if (found.watts !== undefined && found.kwh !== undefined)
    throw new BadRequest(
      'Nothing was imported. The header has both watts and kwh: use either watts or kwh, not both',
    )
  if (found.watts === undefined && found.kwh === undefined)
    throw new BadRequest(
      'Nothing was imported. The header needs watts or kwh as its reading column',
    )
  return {
    ts: found.ts,
    value: (found.watts ?? found.kwh) as number,
    unit: found.watts !== undefined ? 'WATTS' : 'KWH',
    volts: found.volts ?? -1,
    amps: found.amps ?? -1,
    count: names.length,
    header: line.trim(),
  }
}

/**
 * The average-power row for energy used since `previous`, or null for the very first kWh row (it only sets the
 * starting time). Times are compared to the minute, the resolution readings are stored at.
 */
function energyRow(ms: number, kwh: number, previous: number | null): CsvRow | null {
  if (previous === null) return null
  const minute = floorMinute(ms)
  const previousMinute = floorMinute(previous)
  if (minute <= previousMinute)
    throw new RowError(`kWh rows must be later than the row before (${instantText(previous)})`)
  const minutes = Math.floor((minute - previousMinute) / MIN)
  if (minutes > MAX_INTERVAL_MINUTES)
    throw new RowError(
      `the interval since the previous row is ${describeMinutes(minutes)}; kWh rows must be at most ${describeMinutes(MAX_INTERVAL_MINUTES)} apart, so export more often`,
    )
  const watts = averageWatts(kwh, minutes)
  if (watts > MAX_WATTS)
    throw new RowError(
      `kwh is more than ${MAX_WATTS} watts could draw over ${describeMinutes(minutes)}`,
    )
  return { ms: minute, watts, intervalMinutes: minutes }
}

/** Mirrors CsvReadings.parse: every row is valid or the whole file is refused, listing the first problems. */
export function parseCsv(csv: string): CsvRow[] {
  const rows: CsvRow[] = []
  const problems: string[] = []
  const lines = csv.split(/\r?\n/)
  let columns: Columns | null = null
  let previous: number | null = null
  for (let i = 0; i < lines.length; i += 1) {
    const line = (lines[i] ?? '').trim()
    const lineNo = i + 1
    if (line === '') continue
    if (columns === null) {
      // ISO timestamps start with a digit; a header starts with a letter.
      if (/^[A-Za-z]/.test(line)) {
        columns = columnsFromHeader(line)
        continue
      }
      columns = DEFAULT_COLUMNS
    }
    if (rows.length + problems.length >= CSV_MAX_ROWS)
      throw new BadRequest(`A file can hold at most ${CSV_MAX_ROWS} readings. Import it in parts`)
    const cells = line.split(',')
    const cell = (index: number): string => cells[index] ?? ''
    if (cells.length !== columns.count) {
      problems.push(`line ${lineNo}: expected ${columns.count} columns, as in ${columns.header}`)
      continue
    }
    try {
      const ms = timestampOf(cell(columns.ts).trim())
      if (columns.volts >= 0) numberOf(cell(columns.volts), 'volts', 0, MAX_VOLTS)
      if (columns.amps >= 0) numberOf(cell(columns.amps), 'amps', 0, MAX_AMPS)
      if (columns.unit === 'WATTS') {
        rows.push({
          ms,
          watts: numberOf(cell(columns.value), 'watts', 0, MAX_WATTS),
          intervalMinutes: 0,
        })
      } else {
        const row = energyRow(ms, numberOf(cell(columns.value), 'kwh', 0, MAX_KWH), previous)
        if (row) rows.push(row)
      }
      previous = ms
    } catch (error) {
      if (!(error instanceof RowError)) throw error
      problems.push(`line ${lineNo}: ${error.message}`)
    }
  }
  if (problems.length > 0) {
    const shown = problems.slice(0, MAX_PROBLEMS_SHOWN)
    const more =
      problems.length > shown.length ? `; and ${problems.length - shown.length} more` : ''
    throw new BadRequest(`Nothing was imported. ${shown.join('; ')}${more}`)
  }
  if (rows.length === 0)
    throw new BadRequest(
      'The file has no readings. Each line needs a timestamp and watts (or kwh), such as 2026-11-19T10:00:00Z,118.4. A kWh file needs at least two rows',
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
      spread: false,
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
  state.totals.push({ ms: at, kwh: input.kwh })
  const base = {
    outcome: 'RECORDED' as const,
    at: new Date(at).toISOString(),
    previousAt: new Date(last.ms).toISOString(),
    energyKwh: round(delta, 3),
    intervalMinutes: minutes,
    averageWatts: round(watts, 1),
  }
  if (minutes > MAX_INTERVAL_MINUTES) {
    // a long gap: the total is kept, no minute readings are invented across it
    return { ...base, minutesStored: 0, minutesRejected: 0, spread: false }
  }
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
  return { ...base, minutesStored: stored, minutesRejected: minutes - stored, spread: true }
}

/**
 * Mirrors ManualReadingsService.importCsv. A watts row is one reading; a kWh row is one reading per minute of its
 * interval. Duplicates are minutes already stored.
 */
export function importCsv(state: ManualState, csv: string, nowMs: number): CsvImportResult {
  const rows = parseCsv(csv)
  const have = new Set(state.samples.map((s) => s.ms))
  let accepted = 0
  let duplicates = 0
  let rejected = 0
  for (const row of rows) {
    const minutes = Math.max(1, row.intervalMinutes)
    for (let back = minutes - 1; back >= 0; back -= 1) {
      const ms = row.ms - back * MIN
      if (!inWindow(ms, nowMs)) {
        rejected += 1
      } else if (have.has(ms)) {
        duplicates += 1
      } else {
        have.add(ms)
        state.samples.push({ ms, watts: row.watts })
        accepted += 1
      }
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
