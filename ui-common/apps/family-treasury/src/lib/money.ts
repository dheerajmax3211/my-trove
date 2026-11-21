/**
 * Money helpers. Amounts are integers in the currency's minor unit (cents for USD), exactly like the backend's
 * `long`. Nothing here ever uses floating point for money: parsing and formatting go through decimal strings,
 * and allocation uses BigInt so `total * weight` cannot lose precision.
 */

/** Largest amount the API accepts (mirrors the backend's MAX_AMOUNT). */
export const MAX_AMOUNT_MINOR = 999_999_999_999_999

/** Number of minor-unit digits for an ISO-4217 currency (2 for USD, 0 for JPY, 3 for KWD). */
export function minorDigits(currency: string): number {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency }).resolvedOptions()
    .maximumFractionDigits!
}

/** Plain decimal text without grouping, e.g. 1234 USD -> "12.34", -5 USD -> "-0.05". */
export function toDecimalString(minor: number, currency: string): string {
  assertSafe(minor)
  const digits = minorDigits(currency)
  const negative = minor < 0
  const abs = String(Math.abs(minor)).padStart(digits + 1, '0')
  const whole = abs.slice(0, abs.length - digits)
  const fraction = abs.slice(abs.length - digits)
  return `${negative ? '-' : ''}${whole}${digits > 0 ? `.${fraction}` : ''}`
}

/** Locale-aware currency text, e.g. 1234567 USD -> "$12,345.67". Exact: formats the decimal string. */
export function formatMinor(minor: number, currency: string, locale?: string): string {
  const formatter = new Intl.NumberFormat(locale, { style: 'currency', currency })
  return formatter.format(toDecimalString(minor, currency) as Intl.StringNumericLiteral)
}

/** Like formatMinor but always shows the sign: "+$5.00" / "-$5.00" (zero has no sign). */
export function formatSigned(minor: number, currency: string, locale?: string): string {
  if (minor === 0) return formatMinor(0, currency, locale)
  const text = formatMinor(Math.abs(minor), currency, locale)
  return `${minor > 0 ? '+' : '-'}${text}`
}

/** Currency symbol only, for input adornments: "$". */
export function currencySymbol(currency: string, locale?: string): string {
  const part = new Intl.NumberFormat(locale, { style: 'currency', currency })
    .formatToParts(0)
    .find((p) => p.type === 'currency')
  return part?.value ?? currency
}

export type ParseResult = { ok: true; minor: number } | { ok: false; message: string }

const GROUPED = /^\d{1,3}(,\d{3})+(\.\d*)?$/
const PLAIN = /^\d*(\.\d*)?$/

/**
 * Parses what a person types into minor units, exactly. Accepts "12", "12.5", "1,234.56", ".5" and a leading
 * currency symbol. Rejects zero, negatives, too many decimals for the currency, and anything above the API limit.
 */
export function parseAmount(input: string, currency: string): ParseResult {
  const digits = minorDigits(currency)
  const symbol = currencySymbol(currency)
  let text = input.trim().replace(/\s+/g, '')
  if (text.startsWith(symbol)) text = text.slice(symbol.length)
  if (text === '') return { ok: false, message: 'Enter an amount.' }
  if (text.startsWith('-')) return { ok: false, message: 'Enter a positive amount.' }
  if (text.includes(',')) {
    if (!GROUPED.test(text)) return { ok: false, message: 'Check the commas: use 1,234.56 format.' }
    text = text.replaceAll(',', '')
  }
  if (!PLAIN.test(text) || text === '.') {
    return { ok: false, message: 'Use numbers only, for example 12.50.' }
  }
  const [whole = '', fraction = ''] = text.split('.')
  if (fraction.length > digits) {
    return {
      ok: false,
      message:
        digits === 0
          ? `${currency} amounts have no decimals.`
          : `Use at most ${digits} decimal places.`,
    }
  }
  const normalised = `${whole === '' ? '0' : whole}${fraction.padEnd(digits, '0')}`.replace(
    /^0+(?=\d)/,
    '',
  )
  if (normalised.length > 16) return tooLarge(currency)
  const minor = Number(normalised)
  if (!Number.isSafeInteger(minor) || minor > MAX_AMOUNT_MINOR) return tooLarge(currency)
  if (minor === 0) return { ok: false, message: 'Amount must be more than zero.' }
  return { ok: true, minor }
}

function tooLarge(currency: string): ParseResult {
  return {
    ok: false,
    message: `That is more than the largest amount allowed (${formatMinor(MAX_AMOUNT_MINOR, currency)}).`,
  }
}

function assertSafe(minor: number): void {
  if (!Number.isSafeInteger(minor)) throw new RangeError(`not a safe integer amount: ${minor}`)
}

/** Sum of integer amounts; throws instead of silently losing precision. */
export function sumMinor(values: readonly number[]): number {
  let total = 0
  for (const v of values) {
    total += v
    assertSafe(total)
  }
  return total
}

/**
 * Largest-remainder (Hamilton) allocation of `total` across `weights`, matching the backend's
 * `Money.allocateMinor` exactly: each part gets floor(total * w / W); the units left over go one each to the
 * parts with the largest fractional remainders, ties broken by LOWEST INDEX. Parts always sum to `total`.
 * Zero-weight parts get zero. Negative totals are allocated by magnitude and negated.
 */
export function allocateMinor(total: number, weights: readonly number[]): number[] {
  assertSafe(total)
  if (weights.length === 0) throw new RangeError('at least one weight is required')
  const w = weights.map((x) => {
    if (!Number.isSafeInteger(x) || x < 0)
      throw new RangeError('weights must be non-negative integers')
    return BigInt(x)
  })
  const sumWeights = w.reduce((a, b) => a + b, 0n)
  if (sumWeights === 0n) throw new RangeError('at least one weight must be positive')
  const magnitude = BigInt(Math.abs(total))
  const floors = w.map((x) => (magnitude * x) / sumWeights)
  const remainders = w.map((x) => (magnitude * x) % sumWeights)
  const leftover = Number(magnitude - floors.reduce((a, b) => a + b, 0n))
  const order = w
    .map((x, index) => ({ x, index }))
    .filter(({ x }) => x > 0n)
    .sort((a, b) => {
      const ra = remainders[a.index]!
      const rb = remainders[b.index]!
      if (ra !== rb) return ra > rb ? -1 : 1
      return a.index - b.index
    })
  const parts = floors.map((f) => Number(f))
  for (let k = 0; k < leftover; k += 1) parts[order[k]!.index]! += 1
  return total < 0 ? parts.map((p) => -p) : parts
}

export interface SplitShareInput {
  id: string
  weight: number
}

export interface SplitShare extends SplitShareInput {
  shareMinor: number
}

/** The exact split the server will compute for the same shares in the same order. */
export function previewSplit(totalMinor: number, shares: readonly SplitShareInput[]): SplitShare[] {
  const parts = allocateMinor(
    totalMinor,
    shares.map((s) => s.weight),
  )
  return shares.map((s, i) => ({ ...s, shareMinor: parts[i]! }))
}
