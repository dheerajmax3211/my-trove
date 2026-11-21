/** Pure scale and tick logic for the power chart. No DOM, no React, no clock. */

export interface LinearScale {
  (value: number): number
  /** Maps a pixel position back to a domain value. */
  invert: (pixel: number) => number
  readonly domain: readonly [number, number]
  readonly range: readonly [number, number]
}

/** A linear map from `domain` to `range`. A zero-width domain maps everything to the range midpoint. */
export function linearScale(
  domain: readonly [number, number],
  range: readonly [number, number],
): LinearScale {
  const [d0, d1] = domain
  const [r0, r1] = range
  const span = d1 - d0
  const scale = (value: number) =>
    span === 0 ? (r0 + r1) / 2 : r0 + ((value - d0) / span) * (r1 - r0)
  scale.invert = (pixel: number) => (r1 === r0 ? d0 : d0 + ((pixel - r0) / (r1 - r0)) * span)
  scale.domain = domain
  scale.range = range
  return scale
}

/** Rounds to a "nice" 1, 2, 5 x 10^n number (Heckbert). `round` picks nearest; otherwise rounds up. */
export function niceNumber(value: number, round: boolean): number {
  if (!(value > 0) || !Number.isFinite(value)) return 1
  const exponent = Math.floor(Math.log10(value))
  const fraction = value / 10 ** exponent
  let nice: number
  if (round) nice = fraction < 1.5 ? 1 : fraction < 3 ? 2 : fraction < 7 ? 5 : 10
  else nice = fraction <= 1 ? 1 : fraction <= 2 ? 2 : fraction <= 5 ? 5 : 10
  return nice * 10 ** exponent
}

export interface NiceTicks {
  ticks: number[]
  /** Domain extended to the first and last tick. */
  min: number
  max: number
  step: number
}

/** Evenly spaced round tick values covering [min, max], at most about `maxTicks` of them. */
export function niceTicks(min: number, max: number, maxTicks = 5): NiceTicks {
  const lo = Math.min(min, max)
  let hi = Math.max(min, max)
  if (hi === lo) hi = lo + 1
  const step = niceNumber(niceNumber(hi - lo, false) / Math.max(1, maxTicks - 1), true)
  const niceMin = Math.floor(lo / step) * step
  const niceMax = Math.ceil(hi / step) * step
  const decimals = Math.max(0, -Math.floor(Math.log10(step)))
  const ticks: number[] = []
  for (let i = 0; niceMin + i * step <= niceMax + step / 1e6; i += 1) {
    ticks.push(Number((niceMin + i * step).toFixed(decimals)))
  }
  return {
    ticks,
    min: Number(niceMin.toFixed(decimals)),
    max: Number(niceMax.toFixed(decimals)),
    step,
  }
}

const MIN = 60_000
const HOUR = 60 * MIN
const DAY = 24 * HOUR

/** Candidate spacings for time ticks, from one minute to two weeks. */
export const TIME_STEPS_MS: readonly number[] = [
  MIN,
  2 * MIN,
  5 * MIN,
  10 * MIN,
  15 * MIN,
  30 * MIN,
  HOUR,
  2 * HOUR,
  3 * HOUR,
  6 * HOUR,
  12 * HOUR,
  DAY,
  2 * DAY,
  7 * DAY,
  14 * DAY,
]

/** Minutes to add to local wall-clock time to get UTC, as `Date#getTimezoneOffset` reports it. */
export type OffsetMinutes = (utcMs: number) => number

export const browserOffset: OffsetMinutes = (utcMs) => new Date(utcMs).getTimezoneOffset()

export interface TimeTicks {
  ticks: number[]
  stepMs: number
}

/**
 * Tick instants (epoch ms) inside [from, to] on round local-time boundaries (:00/:30, midnight...), using the
 * smallest spacing that yields at most `maxTicks`. `offset` is injectable so tests do not depend on the
 * machine's time zone and daylight-saving shifts stay correct per tick.
 */
export function timeTicks(
  from: number,
  to: number,
  maxTicks = 6,
  offset: OffsetMinutes = browserOffset,
): TimeTicks {
  const span = Math.max(0, to - from)
  const stepMs =
    TIME_STEPS_MS.find((step) => span / step <= maxTicks - 1 + 1e-9) ??
    TIME_STEPS_MS[TIME_STEPS_MS.length - 1] ??
    DAY
  const toLocal = (utc: number) => utc - offset(utc) * MIN
  const toUtc = (local: number) => {
    const guess = local + offset(local) * MIN
    return local + offset(guess) * MIN
  }
  const ticks: number[] = []
  for (let local = Math.ceil(toLocal(from) / stepMs) * stepMs; ; local += stepMs) {
    const utc = toUtc(local)
    if (utc > to) break
    if (utc >= from) ticks.push(utc)
  }
  return { ticks, stepMs }
}

/** Index of the entry in the ascending `values` closest to `target`; -1 for an empty list. */
export function nearestIndex(values: readonly number[], target: number): number {
  if (values.length === 0) return -1
  let lo = 0
  let hi = values.length - 1
  while (lo < hi) {
    const mid = (lo + hi) >> 1
    if ((values[mid] ?? 0) < target) lo = mid + 1
    else hi = mid
  }
  if (lo === 0) return 0
  const before = values[lo - 1] ?? 0
  const at = values[lo] ?? 0
  return target - before <= at - target ? lo - 1 : lo
}

export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}
