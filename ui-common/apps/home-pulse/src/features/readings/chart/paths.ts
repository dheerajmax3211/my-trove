import type { LinearScale } from './scale'
import type { Point } from './series'

type Segments = readonly (readonly Point[])[]

const fmt = (n: number): string => String(Math.round(n * 100) / 100)

/** One "M x y L x y ..." sub-path per run of readings. Single-reading runs have no line (see `isolatedPoints`). */
export function linePath(segments: Segments, x: LinearScale, y: LinearScale): string {
  return segments
    .filter((s) => s.length > 1)
    .map((s) => s.map((p, i) => `${i === 0 ? 'M' : 'L'}${fmt(x(p.t))} ${fmt(y(p.avg))}`).join(' '))
    .join(' ')
}

/** The area under the average line, closed down to `baseline`, one closed shape per run. */
export function areaPath(
  segments: Segments,
  x: LinearScale,
  y: LinearScale,
  baseline: number,
): string {
  return segments
    .filter((s) => s.length > 1)
    .map((s) => {
      const first = s[0] as Point
      const last = s[s.length - 1] as Point
      const top = s.map((p) => `L${fmt(x(p.t))} ${fmt(y(p.avg))}`).join(' ')
      return `M${fmt(x(first.t))} ${fmt(baseline)} ${top} L${fmt(x(last.t))} ${fmt(baseline)} Z`
    })
    .join(' ')
}

/** The lowest-to-highest band of each run (only meaningful for aggregated readings). */
export function bandPath(segments: Segments, x: LinearScale, y: LinearScale): string {
  return segments
    .filter((s) => s.length > 1)
    .map((s) => {
      const upper = s.map((p, i) => `${i === 0 ? 'M' : 'L'}${fmt(x(p.t))} ${fmt(y(p.max))}`)
      const lower = [...s].reverse().map((p) => `L${fmt(x(p.t))} ${fmt(y(p.min))}`)
      return `${upper.join(' ')} ${lower.join(' ')} Z`
    })
    .join(' ')
}

/** Readings that cannot form a line (an isolated bucket) are drawn as dots so they are not lost. */
export function isolatedPoints(segments: Segments): Point[] {
  return segments.filter((s) => s.length === 1).map((s) => s[0] as Point)
}
