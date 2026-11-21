import { describe, expect, it } from 'vitest'
import { areaPath, bandPath, isolatedPoints, linePath } from './paths'
import { linearScale } from './scale'
import type { Point } from './series'

const p = (t: number, avg: number, min = avg, max = avg): Point => ({
  t,
  avg,
  min,
  max,
  samples: 1,
})
const x = linearScale([0, 100], [0, 200])
const y = linearScale([0, 50], [100, 0])

describe('chart paths', () => {
  it('draws one sub-path per run so a gap stays a gap', () => {
    const d = linePath(
      [
        [p(0, 0), p(10, 25)],
        [p(50, 50), p(60, 50)],
      ],
      x,
      y,
    )
    expect(d).toBe('M0 100 L20 50 M100 0 L120 0')
    expect(d.match(/M/g)).toHaveLength(2)
  })

  it('draws nothing for runs of a single reading, and reports them as isolated points', () => {
    const lone = p(5, 5)
    expect(linePath([[lone]], x, y)).toBe('')
    expect(areaPath([[lone]], x, y, 100)).toBe('')
    expect(isolatedPoints([[lone], [p(0, 1), p(1, 1)]])).toEqual([lone])
  })

  it('closes each area down to the baseline', () => {
    expect(areaPath([[p(0, 0), p(10, 25)]], x, y, 100)).toBe('M0 100 L0 100 L20 50 L20 100 Z')
  })

  it('traces the band along the highs and back along the lows', () => {
    const d = bandPath([[p(0, 10, 5, 20), p(10, 10, 6, 30)]], x, y)
    expect(d).toBe('M0 60 L20 40 L20 88 L0 90 Z')
  })

  it('returns empty strings for no data', () => {
    expect(linePath([], x, y)).toBe('')
    expect(bandPath([], x, y)).toBe('')
  })
})
