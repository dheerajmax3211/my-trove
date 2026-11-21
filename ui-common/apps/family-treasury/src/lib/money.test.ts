import { describe, expect, it } from 'vitest'
import {
  MAX_AMOUNT_MINOR,
  allocateMinor,
  formatMinor,
  formatSigned,
  minorDigits,
  parseAmount,
  previewSplit,
  sumMinor,
  toDecimalString,
} from './money'

describe('minorDigits', () => {
  it('knows the minor unit of common currencies', () => {
    expect(minorDigits('USD')).toBe(2)
    expect(minorDigits('JPY')).toBe(0)
    expect(minorDigits('KWD')).toBe(3)
  })
})

describe('toDecimalString / formatMinor', () => {
  it('builds exact decimal text without floats', () => {
    expect(toDecimalString(1234, 'USD')).toBe('12.34')
    expect(toDecimalString(5, 'USD')).toBe('0.05')
    expect(toDecimalString(-5, 'USD')).toBe('-0.05')
    expect(toDecimalString(0, 'USD')).toBe('0.00')
    expect(toDecimalString(500, 'JPY')).toBe('500')
    expect(toDecimalString(1234, 'KWD')).toBe('1.234')
  })

  it('formats with Intl, including values a double cannot hold exactly', () => {
    expect(formatMinor(1234567, 'USD', 'en-US')).toBe('$12,345.67')
    expect(formatMinor(-5, 'USD', 'en-US')).toBe('-$0.05')
    expect(formatMinor(500, 'JPY', 'en-US')).toBe('¥500')
    // 2^53 - 1 cents: 90,071,992,547,409.91 dollars, exact.
    expect(formatMinor(Number.MAX_SAFE_INTEGER, 'USD', 'en-US')).toBe('$90,071,992,547,409.91')
  })

  it('formats signed amounts', () => {
    expect(formatSigned(500, 'USD', 'en-US')).toBe('+$5.00')
    expect(formatSigned(-500, 'USD', 'en-US')).toBe('-$5.00')
    expect(formatSigned(0, 'USD', 'en-US')).toBe('$0.00')
  })

  it('refuses unsafe integers instead of silently rounding', () => {
    expect(() => toDecimalString(2 ** 53, 'USD')).toThrow(RangeError)
    expect(() => toDecimalString(1.5, 'USD')).toThrow(RangeError)
  })
})

describe('parseAmount', () => {
  const ok = (text: string, currency = 'USD') => {
    const r = parseAmount(text, currency)
    return r.ok ? r.minor : r.message
  }

  it('parses plain, grouped and symbol-prefixed amounts exactly', () => {
    expect(ok('12')).toBe(1200)
    expect(ok('12.5')).toBe(1250)
    expect(ok('12.50')).toBe(1250)
    expect(ok('.5')).toBe(50)
    expect(ok('0.07')).toBe(7)
    expect(ok('1,234.56')).toBe(123456)
    expect(ok('$ 1,234.56')).toBe(123456)
    expect(ok('  19.99  ')).toBe(1999)
    expect(ok('1,000')).toBe(100000)
    expect(ok('500', 'JPY')).toBe(500)
    expect(ok('1.234', 'KWD')).toBe(1234)
  })

  it('does not go through floating point (0.1 + 0.2 style traps)', () => {
    expect(ok('0.29')).toBe(29)
    expect(ok('1.15')).toBe(115)
    expect(ok('4.35')).toBe(435)
    expect(ok('8.2')).toBe(820)
  })

  it('rejects bad input with a helpful message', () => {
    expect(ok('')).toMatch(/enter an amount/i)
    expect(ok('abc')).toMatch(/numbers only/i)
    expect(ok('1.234')).toMatch(/at most 2 decimal/i)
    expect(ok('1.5', 'JPY')).toMatch(/no decimals/i)
    expect(ok('-5')).toMatch(/positive/i)
    expect(ok('0')).toMatch(/more than zero/i)
    expect(ok('0.00')).toMatch(/more than zero/i)
    expect(ok('1,5')).toMatch(/commas/i)
    expect(ok('12,34.50')).toMatch(/commas/i)
    expect(ok('1.2.3')).toMatch(/numbers only/i)
    expect(ok('.')).toMatch(/numbers only/i)
  })

  it('enforces the API limit', () => {
    expect(ok('9,999,999,999,999.99')).toBe(MAX_AMOUNT_MINOR)
    expect(ok('10,000,000,000,000.00')).toMatch(/largest amount/i)
    expect(ok('99999999999999999999')).toMatch(/largest amount/i)
  })
})

describe('allocateMinor (largest remainder, matches the backend)', () => {
  it('matches known vectors', () => {
    expect(allocateMinor(100, [1, 1, 1])).toEqual([34, 33, 33])
    expect(allocateMinor(10000, [1, 1, 1])).toEqual([3334, 3333, 3333])
    expect(allocateMinor(10, [3, 1])).toEqual([8, 2])
    expect(allocateMinor(1, [1, 1])).toEqual([1, 0])
    expect(allocateMinor(0, [1, 2])).toEqual([0, 0])
    expect(allocateMinor(100, [1, 2, 3])).toEqual([17, 33, 50])
  })

  it('gives leftovers to the largest remainders, ties to the lowest index', () => {
    // 10 split 1:1:1 -> floors 3,3,3 with equal remainders: the extra unit goes to index 0.
    expect(allocateMinor(10, [1, 1, 1])).toEqual([4, 3, 3])
    // 7 split 1:2:2 -> exact 1.4, 2.8, 2.8 -> floors 1,2,2 (leftover 2) -> remainders .4,.8,.8 -> index 1 and 2.
    expect(allocateMinor(7, [1, 2, 2])).toEqual([1, 3, 3])
  })

  it('gives zero-weight parts nothing and never the leftover', () => {
    expect(allocateMinor(10, [0, 1, 1])).toEqual([0, 5, 5])
    expect(allocateMinor(5, [0, 1, 1])).toEqual([0, 3, 2])
  })

  it('allocates negative totals by magnitude', () => {
    expect(allocateMinor(-100, [1, 1, 1])).toEqual([-34, -33, -33])
  })

  it('always sums exactly to the total (deterministic pseudo-random sweep)', () => {
    let seed = 20261118
    const next = (max: number) => {
      seed = (seed * 1103515245 + 12345) % 2 ** 31
      return seed % max
    }
    for (let i = 0; i < 2000; i += 1) {
      const n = 1 + next(12)
      const weights = Array.from({ length: n }, () => next(1_000_000) + 1)
      const total = next(2 ** 30) * (1 + next(1000))
      const parts = allocateMinor(total, weights)
      expect(sumMinor(parts)).toBe(total)
      expect(parts.every((p) => p >= 0)).toBe(true)
      // Each part is within one unit of its exact proportional share.
      const sumW = weights.reduce((a, b) => a + b, 0)
      parts.forEach((p, idx) => {
        const exact = (BigInt(total) * BigInt(weights[idx]!)) / BigInt(sumW)
        expect(BigInt(p) - exact === 0n || BigInt(p) - exact === 1n).toBe(true)
      })
    }
  })

  it('is exact for totals where total * weight exceeds 2^53', () => {
    const parts = allocateMinor(999_999_999_999_999, [1_000_000, 999_999, 1])
    expect(sumMinor(parts)).toBe(999_999_999_999_999)
  })

  it('rejects impossible input like the backend does', () => {
    expect(() => allocateMinor(10, [])).toThrow(RangeError)
    expect(() => allocateMinor(10, [0, 0])).toThrow(RangeError)
    expect(() => allocateMinor(10, [-1, 2])).toThrow(RangeError)
    expect(() => allocateMinor(10, [1.5])).toThrow(RangeError)
  })
})

describe('previewSplit', () => {
  it('keeps order and ids and sums exactly', () => {
    const rows = previewSplit(10000, [
      { id: 'a', weight: 1 },
      { id: 'b', weight: 1 },
      { id: 'c', weight: 1 },
    ])
    expect(rows.map((r) => [r.id, r.shareMinor])).toEqual([
      ['a', 3334],
      ['b', 3333],
      ['c', 3333],
    ])
    expect(sumMinor(rows.map((r) => r.shareMinor))).toBe(10000)
  })
})
