import { describe, expect, it } from 'vitest'
import { remainingFraction } from './CountdownRing'

describe('remainingFraction', () => {
  it('is the share of the stretch that is left, kept between 0 and 1', () => {
    expect(remainingFraction(50_000, 100)).toBe(0.5)
    expect(remainingFraction(-5, 100)).toBe(0)
    expect(remainingFraction(500_000, 100)).toBe(1)
  })
  it('shows a full ring when the length of the stretch is not known', () => {
    expect(remainingFraction(1000, null)).toBe(1)
    expect(remainingFraction(1000, 0)).toBe(1)
  })
})
