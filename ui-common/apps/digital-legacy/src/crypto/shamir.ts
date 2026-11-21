import { gfAdd, gfDiv, gfMul } from './gf256'
import { bytesOf, equalBytes, fromBase64, randomBytes, toBase64, type Bytes } from './bytes'

/**
 * Shamir's Secret Sharing over GF(256), applied independently to every byte of the secret. A port of
 * the server's reference `Shamir.java`: the byte layout, the order in which randomness is consumed
 * and every rejection rule match, so shares made here combine there and vice versa.
 *
 * Wire format of one share: `[version=1][threshold][setId(4)][x][y...]`. `setId` is a random tag
 * shared by all shares of one split so shares from different splits are rejected instead of silently
 * reconstructing garbage. Sharing is NOT authenticated: an altered share of the right set yields a
 * wrong secret, which the AES-GCM vault decryption then rejects.
 */

export const SHAMIR_VERSION = 1
export const MAX_SHARES = 255
export const SET_ID_LENGTH = 4
export const MAX_SECRET_BYTES = 65_536
const HEADER = 2 + SET_ID_LENGTH + 1

export class ShamirError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'ShamirError'
  }
}

export interface Share {
  readonly threshold: number
  readonly setId: Bytes
  /** The share's x-coordinate, 1..255. */
  readonly x: number
  /** One byte per secret byte. */
  readonly y: Bytes
}

/** Source of random bytes. Production uses the platform CSPRNG; tests replay a fixed stream. */
export type RandomSource = (length: number) => Bytes

export function createShare(threshold: number, setId: Uint8Array, x: number, y: Uint8Array): Share {
  if (!Number.isInteger(threshold) || threshold < 1 || threshold > MAX_SHARES)
    throw new ShamirError(`threshold out of range: ${threshold}`)
  if (setId.length !== SET_ID_LENGTH)
    throw new ShamirError(`share set id must be ${SET_ID_LENGTH} bytes`)
  if (!Number.isInteger(x) || x < 1 || x > MAX_SHARES)
    throw new ShamirError(`share x-coordinate out of range: ${x}`)
  if (y.length === 0 || y.length > MAX_SECRET_BYTES)
    throw new ShamirError('share payload has an invalid length')
  return { threshold, setId: bytesOf(setId), x, y: bytesOf(y) }
}

export function encodeShare(share: Share): Bytes {
  const out = new Uint8Array(new ArrayBuffer(HEADER + share.y.length))
  out[0] = SHAMIR_VERSION
  out[1] = share.threshold
  out.set(share.setId, 2)
  out[2 + SET_ID_LENGTH] = share.x
  out.set(share.y, HEADER)
  return out
}

export function decodeShare(encoded: Uint8Array): Share {
  if (encoded.length <= HEADER) throw new ShamirError('share is too short')
  if (encoded[0] !== SHAMIR_VERSION)
    throw new ShamirError(`unsupported share version ${encoded[0]}`)
  return createShare(
    encoded[1] ?? 0,
    encoded.subarray(2, 2 + SET_ID_LENGTH),
    encoded[2 + SET_ID_LENGTH] ?? 0,
    encoded.subarray(HEADER),
  )
}

/**
 * Splits `secret` into `n` shares of which any `threshold` reconstruct it. Randomness is consumed in
 * the same order as the reference implementation: the 4-byte set id, then one row of
 * `secret.length` coefficient bytes per polynomial degree 1..threshold-1.
 */
export function split(
  secret: Uint8Array,
  n: number,
  threshold: number,
  random: RandomSource = randomBytes,
): Share[] {
  if (secret.length === 0 || secret.length > MAX_SECRET_BYTES)
    throw new ShamirError(`secret must be 1..${MAX_SECRET_BYTES} bytes`)
  if (!Number.isInteger(n) || n < 1 || n > MAX_SHARES)
    throw new ShamirError(`n must be in 1..${MAX_SHARES}`)
  if (!Number.isInteger(threshold) || threshold < 1 || threshold > n)
    throw new ShamirError('threshold must be in 1..n')

  const setId = random(SET_ID_LENGTH)
  // coefficients[d - 1][k] is the degree-d coefficient of the polynomial for secret byte k
  const coefficients: Bytes[] = []
  for (let d = 1; d < threshold; d++) coefficients.push(random(secret.length))

  const shares: Share[] = []
  for (let x = 1; x <= n; x++) {
    const y = new Uint8Array(new ArrayBuffer(secret.length))
    for (let k = 0; k < secret.length; k++) {
      let acc = 0 // Horner, highest degree first, constant term last
      for (let d = threshold - 1; d >= 1; d--) {
        acc = gfAdd(gfMul(acc, x), coefficients[d - 1]?.[k] ?? 0)
      }
      y[k] = gfAdd(gfMul(acc, x), secret[k] ?? 0)
    }
    shares.push(createShare(threshold, setId, x, y))
  }
  for (const row of coefficients) row.fill(0)
  return shares
}

/**
 * Reconstructs the secret. All shares must come from the same split, have distinct x, and there must
 * be at least `threshold` of them. Surplus shares are verified to lie on the same polynomial.
 */
export function combine(shares: readonly Share[]): Bytes {
  const first = shares[0]
  if (!first) throw new ShamirError('no shares supplied')
  const seenX = new Set<number>()
  for (const s of shares) {
    if (s.threshold !== first.threshold) throw new ShamirError('shares disagree on the threshold')
    if (!equalBytes(s.setId, first.setId))
      throw new ShamirError('shares belong to different splits')
    if (s.y.length !== first.y.length) throw new ShamirError('shares have different lengths')
    if (seenX.has(s.x)) throw new ShamirError(`duplicate share x=${s.x}`)
    seenX.add(s.x)
  }
  const t = first.threshold
  if (shares.length < t)
    throw new ShamirError(`need ${t} shares but only ${shares.length} supplied`)

  const base = shares.slice(0, t)
  const xs = base.map((s) => s.x)
  const ys = base.map((s) => s.y)
  for (const extra of shares.slice(t)) {
    if (!equalBytes(interpolate(xs, ys, extra.x), extra.y))
      throw new ShamirError(`share x=${extra.x} is inconsistent with the others`)
  }
  return interpolate(xs, ys, 0)
}

/** Lagrange interpolation of the polynomial through (xs[i], ys[i]), evaluated at `at`, per byte. */
function interpolate(xs: readonly number[], ys: readonly Uint8Array[], at: number): Bytes {
  const t = xs.length
  const weights: number[] = []
  for (let i = 0; i < t; i++) {
    let num = 1
    let den = 1
    for (let j = 0; j < t; j++) {
      if (i !== j) {
        num = gfMul(num, gfAdd(at, xs[j] ?? 0))
        den = gfMul(den, gfAdd(xs[i] ?? 0, xs[j] ?? 0))
      }
    }
    weights.push(gfDiv(num, den))
  }
  const length = ys[0]?.length ?? 0
  const out = new Uint8Array(new ArrayBuffer(length))
  for (let k = 0; k < length; k++) {
    let acc = 0
    for (let i = 0; i < t; i++) acc = gfAdd(acc, gfMul(ys[i]?.[k] ?? 0, weights[i] ?? 0))
    out[k] = acc
  }
  return out
}

// ---- text form, for sending a share between people ---------------------------------------------

const SHARE_PREFIX = 'DLSHARE1:'

/** The form in which a trustee hands their opened share to the others: a single pasteable line. */
export function shareToText(share: Share): string {
  return SHARE_PREFIX + toBase64(encodeShare(share))
}

export function shareFromText(text: string): Share {
  const trimmed = text.replace(/\s+/g, '')
  if (!trimmed.startsWith(SHARE_PREFIX))
    throw new ShamirError('This does not look like a share (it should start with DLSHARE1:)')
  try {
    return decodeShare(fromBase64(trimmed.slice(SHARE_PREFIX.length)))
  } catch (cause) {
    if (cause instanceof ShamirError) throw cause
    throw new ShamirError('This share text is damaged: it is not valid Base64')
  }
}

/** Hex form of a share's set id, shown to trustees so they can tell which split a share belongs to. */
export function setIdLabel(share: Share): string {
  return Array.from(share.setId, (b) => b.toString(16).padStart(2, '0')).join('')
}
