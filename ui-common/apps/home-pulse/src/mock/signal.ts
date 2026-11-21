import type { ReadingPoint, Resolution } from '../features/readings/types'

/** Deterministic synthetic power signal for the in-memory demo: the same instant always gives the same value. */

export interface Outage {
  fromMs: number
  toMs: number
}

export interface SignalProfile {
  seed: number
  standbyWatts: number
  onWatts: number
  /** Length of one on/off cycle. */
  periodMin: number
  /** Fraction of each cycle spent on. */
  duty: number
  /** Relative jitter of the on level. */
  noise: number
  /** Multiplies the on level, ramping from 1 to `factor` between `startMs` and `endMs` (a degrading compressor). */
  ramp?: { startMs: number; endMs: number; factor: number }
  /** From this instant the appliance never switches off. */
  stuckOnSince?: number
  /** The device reports from `dataFrom` until `dataTo` (`null`: still reporting). */
  dataFrom: number
  dataTo: number | null
  /** Windows where nothing was received. */
  outages: Outage[]
}

export const SAMPLE_MS = 10_000

const BUCKET_MS: Record<Resolution, number> = {
  RAW: SAMPLE_MS,
  ONE_MINUTE: 60_000,
  ONE_HOUR: 3_600_000,
  ONE_DAY: 86_400_000,
}

export const bucketMs = (resolution: Resolution): number => BUCKET_MS[resolution]

function rand(seed: number, n: number): number {
  let h = Math.imul(seed ^ 0x9e3779b9, 374761393) + Math.imul(n, 668265263)
  h = Math.imul(h ^ (h >>> 13), 1274126177)
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296
}

export function hasData(p: SignalProfile, t: number, nowMs: number): boolean {
  if (t < p.dataFrom || t > Math.min(p.dataTo ?? nowMs, nowMs)) return false
  return !p.outages.some((o) => t >= o.fromMs && t < o.toMs)
}

export function isOn(p: SignalProfile, t: number): boolean {
  if (p.stuckOnSince !== undefined && t >= p.stuckOnSince) return true
  const minutes = t / 60_000 + (p.seed % p.periodMin)
  return minutes % p.periodMin < p.periodMin * p.duty
}

export function wattsAt(p: SignalProfile, t: number): number {
  const jitter = 1 + p.noise * (2 * rand(p.seed, Math.floor(t / SAMPLE_MS)) - 1)
  if (!isOn(p, t)) return Math.max(0, p.standbyWatts * jitter)
  const ramp = p.ramp
  const progress = ramp
    ? Math.min(1, Math.max(0, (t - ramp.startMs) / (ramp.endMs - ramp.startMs)))
    : 0
  const level = p.onWatts * (1 + (ramp ? (ramp.factor - 1) * progress : 0))
  return level * jitter
}

const round1 = (n: number): number => Math.round(n * 10) / 10

function point(ts: number, watts: number[], resolution: Resolution): ReadingPoint {
  const avg = watts.reduce((a, b) => a + b, 0) / watts.length
  return {
    ts: new Date(ts).toISOString(),
    avgWatts: round1(avg),
    minWatts: round1(Math.min(...watts)),
    maxWatts: round1(Math.max(...watts)),
    avgVolts: round1(229 + rand(1, ts / 60_000) * 2),
    avgAmps: Math.round((avg / 230) * 100) / 100,
    samples:
      resolution === 'RAW' ? 1 : Math.round((watts.length * stepFor(resolution)) / SAMPLE_MS),
  }
}

const stepFor = (resolution: Resolution): number =>
  resolution === 'RAW'
    ? SAMPLE_MS
    : Math.max(SAMPLE_MS, Math.round(bucketMs(resolution) / 30 / SAMPLE_MS) * SAMPLE_MS)

/** Buckets aligned to the resolution; a bucket exists only when at least one sample was received in it. */
export function seriesFor(
  p: SignalProfile,
  fromMs: number,
  toMs: number,
  resolution: Resolution,
  nowMs: number,
): ReadingPoint[] {
  const bucket = bucketMs(resolution)
  const step = stepFor(resolution)
  const out: ReadingPoint[] = []
  for (let start = Math.floor(fromMs / bucket) * bucket; start < toMs; start += bucket) {
    const watts: number[] = []
    const lo = Math.max(start, fromMs)
    const hi = Math.min(start + bucket, toMs)
    for (let t = Math.ceil(lo / step) * step; t < hi; t += step) {
      if (hasData(p, t, nowMs)) watts.push(wattsAt(p, t))
    }
    if (watts.length > 0) out.push(point(start, watts, resolution))
  }
  return out
}

/** The time of the newest reading at or before `nowMs`, or null if the device never reported. */
export function lastSeen(p: SignalProfile, nowMs: number): number | null {
  const newest = Math.min(p.dataTo ?? nowMs, nowMs)
  for (let t = Math.floor(newest / SAMPLE_MS) * SAMPLE_MS; t >= p.dataFrom; t -= SAMPLE_MS) {
    if (hasData(p, t, nowMs)) return t
  }
  return null
}
