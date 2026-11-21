import { describe, expect, it } from 'vitest'
import vectors from './__fixtures__/javaVectors.json'
import { fromHex, toHex, utf8Encode } from './bytes'
import { gfAdd, gfDiv, gfInv, gfMul } from './gf256'
import {
  combine,
  createShare,
  decodeShare,
  encodeShare,
  setIdLabel,
  shareFromText,
  shareToText,
  ShamirError,
  split,
  type Share,
} from './shamir'
import { replayRandom } from './testing'

const sha256Hex = async (bytes: Uint8Array) =>
  toHex(
    new Uint8Array(
      await globalThis.crypto.subtle.digest('SHA-256', bytes as Uint8Array<ArrayBuffer>),
    ),
  )

/** Every k-element subset of `items`, in order. */
function subsets<T>(items: readonly T[], k: number): T[][] {
  if (k === 0) return [[]]
  if (items.length < k) return []
  const [head, ...rest] = items as [T, ...T[]]
  return [...subsets(rest, k - 1).map((s) => [head, ...s]), ...subsets(rest, k)]
}

describe('GF(256) arithmetic', () => {
  it('matches the FIPS-197 worked examples', () => {
    expect(gfMul(0x53, 0xca)).toBe(0x01)
    expect(gfMul(0x57, 0x83)).toBe(0xc1)
    expect(gfMul(0x57, 0x13)).toBe(0xfe)
  })

  it('is identical to the Java reference: full multiplication table and every inverse', async () => {
    const table = new Uint8Array(256 * 256)
    for (let a = 0; a < 256; a++) for (let b = 0; b < 256; b++) table[a * 256 + b] = gfMul(a, b)
    expect(await sha256Hex(table)).toBe(vectors.gfMulTableSha256)
    const inverses = new Uint8Array(255)
    for (let a = 1; a < 256; a++) inverses[a - 1] = gfInv(a)
    expect(toHex(inverses)).toBe(vectors.gfInverses)
  })

  it('obeys the field laws on every element', () => {
    for (let a = 1; a < 256; a++) {
      expect(gfMul(a, gfInv(a))).toBe(1)
      expect(gfDiv(a, a)).toBe(1)
      expect(gfMul(a, 1)).toBe(a)
      expect(gfMul(a, 0)).toBe(0)
      expect(gfAdd(a, a)).toBe(0)
    }
  })

  it('refuses to invert zero', () => {
    expect(() => gfInv(0)).toThrow(RangeError)
  })
})

describe('compatibility with the Java reference implementation', () => {
  it.each(vectors.splits.map((v) => [`${v.t}-of-${v.n}`, v] as const))(
    'reproduces the shares Java produced for %s from the same randomness',
    (_name, v) => {
      const random = replayRandom(fromHex(v.random))
      const shares = split(fromHex(v.secret), v.n, v.t, random)
      expect(random.remaining()).toBe(0) // consumed exactly as many bytes, in the same order
      const encoded = new Map(shares.map((s) => [s.x, toHex(encodeShare(s))]))
      for (const javaShare of v.shares) {
        const decoded = decodeShare(fromHex(javaShare))
        expect(encoded.get(decoded.x)).toBe(javaShare)
      }
    },
  )

  it.each(vectors.splits.filter((v) => v.n < 255).map((v) => [`${v.t}-of-${v.n}`, v] as const))(
    'combines Java-made shares for %s back into the secret',
    (_name, v) => {
      const javaShares = v.shares.map((s) => decodeShare(fromHex(s)))
      expect(toHex(combine(javaShares.slice(0, v.t)))).toBe(v.secret)
    },
  )

  it('recombines a 128-of-255 split reproduced from the Java vector using shares that were never listed', () => {
    const v = vectors.splits.find((s) => s.n === 255)
    if (!v) throw new Error('vector missing')
    const shares = split(fromHex(v.secret), 255, v.t, replayRandom(fromHex(v.random)))
    expect(toHex(combine(shares.slice(100, 100 + v.t)))).toBe(v.secret)
  })
})

describe('split and combine', () => {
  const secret = utf8Encode('0123456789abcdef0123456789abcdef')

  it.each([
    [1, 1],
    [2, 1],
    [2, 2],
    [3, 2],
    [4, 3],
    [5, 3],
    [5, 5],
    [6, 4],
    [7, 4],
  ])('recovers from every threshold subset of a split with n=%i, t=%i', (n, t) => {
    const shares = split(secret, n, t)
    expect(shares).toHaveLength(n)
    expect(new Set(shares.map((s) => s.x)).size).toBe(n)
    for (const subset of subsets(shares, t)) {
      expect(toHex(combine(subset))).toBe(toHex(secret))
      expect(toHex(combine([...subset].reverse()))).toBe(toHex(secret))
    }
    expect(toHex(combine(shares))).toBe(toHex(secret)) // surplus shares, all consistent
  })

  it('refuses every subset smaller than the threshold', () => {
    const shares = split(secret, 5, 3)
    for (const k of [1, 2]) {
      for (const subset of subsets(shares, k)) {
        expect(() => combine(subset)).toThrow(/need 3 shares but only/)
      }
    }
  })

  it('t-1 shares are consistent with every possible secret byte (they reveal nothing)', () => {
    const [a, b] = split(Uint8Array.of(0xab), 4, 3)
    if (!a || !b) throw new Error('split failed')
    const seen = new Set<number>()
    for (let candidate = 0; candidate < 256; candidate++) {
      seen.add(combine([a, b, forgeThirdShare(a, b, candidate)])[0] ?? -1)
    }
    expect(seen.size).toBe(256)
  })

  it('a share on its own is spread across all values regardless of the secret', () => {
    const values = new Set<number>()
    for (let i = 0; i < 3000; i++) values.add(split(Uint8Array.of(0x42), 3, 2)[0]?.y[0] ?? -1)
    expect(values.size).toBeGreaterThan(240)
  })

  it('uses a fresh set id per split', () => {
    const a = split(secret, 3, 2)[0]
    const b = split(secret, 3, 2)[0]
    expect(a && b && setIdLabel(a)).not.toBe(b && setIdLabel(b))
  })

  it('rejects invalid split parameters', () => {
    expect(() => split(new Uint8Array(0), 3, 2)).toThrow(ShamirError)
    expect(() => split(secret, 0, 1)).toThrow(/n must be/)
    expect(() => split(secret, 256, 2)).toThrow(/n must be/)
    expect(() => split(secret, 3, 0)).toThrow(/threshold must be/)
    expect(() => split(secret, 3, 4)).toThrow(/threshold must be/)
    expect(() => split(new Uint8Array(65_537), 3, 2)).toThrow(/secret must be/)
  })
})

describe('rejection of bad share sets', () => {
  const secret = utf8Encode('a-vault-key-of-32-bytes-exactly!')
  const [s1, s2, s3, s4] = split(secret, 5, 3) as [Share, Share, Share, Share, Share]

  it('rejects an empty set', () => {
    expect(() => combine([])).toThrow(/no shares/)
  })

  it('rejects duplicate shares even when enough shares are supplied', () => {
    expect(() => combine([s1, s2, s1])).toThrow(/duplicate share x=1/)
  })

  it('rejects shares from different splits', () => {
    const [, , other] = split(secret, 5, 3) as [Share, Share, Share]
    expect(() => combine([s1, s2, other])).toThrow(/different splits/)
  })

  it('rejects shares that disagree on the threshold', () => {
    const mixed = createShare(2, s3.setId, s3.x, s3.y)
    expect(() => combine([s1, s2, mixed])).toThrow(/threshold/)
  })

  it('rejects shares of different lengths', () => {
    const truncated = createShare(3, s3.setId, 3, s3.y.slice(0, 8))
    expect(() => combine([s1, s2, truncated])).toThrow(/different lengths/)
  })

  it('detects a corrupted surplus share', () => {
    const bad = createShare(
      3,
      s4.setId,
      s4.x,
      s4.y.map((b) => b ^ 1),
    )
    expect(() => combine([s1, s2, s3, bad])).toThrow(/inconsistent/)
  })

  it('a corrupted share among exactly t yields a wrong secret (Shamir is unauthenticated)', () => {
    const bad = createShare(
      3,
      s3.setId,
      s3.x,
      s3.y.map((b) => b ^ 1),
    )
    expect(toHex(combine([s1, s2, bad]))).not.toBe(toHex(secret))
  })
})

describe('share encoding', () => {
  const share = split(utf8Encode('0123456789abcdef'), 3, 2)[0] as Share

  it('uses the layout [1][t][setId(4)][x][y...]', () => {
    const bytes = encodeShare(share)
    expect(bytes[0]).toBe(1)
    expect(bytes[1]).toBe(2)
    expect(toHex(bytes.subarray(2, 6))).toBe(toHex(share.setId))
    expect(bytes[6]).toBe(1)
    expect(bytes).toHaveLength(7 + 16)
  })

  it('round-trips through bytes and through text', () => {
    expect(decodeShare(encodeShare(share))).toEqual(share)
    expect(shareFromText(`  ${shareToText(share)}\n`)).toEqual(share)
    expect(shareToText(share).startsWith('DLSHARE1:')).toBe(true)
  })

  it('tolerates line breaks inside pasted text', () => {
    const text = shareToText(share)
    expect(shareFromText(`${text.slice(0, 20)}\n${text.slice(20)}`)).toEqual(share)
  })

  it.each([
    ['too short', Uint8Array.of(1, 2, 3, 4, 5, 6, 7)],
    ['unknown version', Uint8Array.of(2, 2, 1, 2, 3, 4, 1, 9)],
    ['threshold zero', Uint8Array.of(1, 0, 1, 2, 3, 4, 1, 9)],
    ['x of zero', Uint8Array.of(1, 2, 1, 2, 3, 4, 0, 9)],
  ])('rejects a malformed share: %s', (_name, bytes) => {
    expect(() => decodeShare(bytes)).toThrow(ShamirError)
  })

  it('rejects text that is not a share', () => {
    expect(() => shareFromText('hello')).toThrow(/DLSHARE1/)
    expect(() => shareFromText('DLSHARE1:***')).toThrow(/damaged/)
    expect(() => shareFromText('DLSHARE1:AAAA')).toThrow(/too short/)
  })
})

/** Builds the x=3 share that makes the interpolated secret equal `candidate`. */
function forgeThirdShare(a: Share, b: Share, candidate: number): Share {
  const xs = [a.x, b.x, 3]
  const weight = (i: number): number => {
    let num = 1
    let den = 1
    for (let j = 0; j < 3; j++)
      if (i !== j) {
        num = gfMul(num, xs[j] ?? 0)
        den = gfMul(den, gfAdd(xs[i] ?? 0, xs[j] ?? 0))
      }
    return gfDiv(num, den)
  }
  const partial = gfAdd(gfMul(a.y[0] ?? 0, weight(0)), gfMul(b.y[0] ?? 0, weight(1)))
  const y3 = gfDiv(gfAdd(candidate, partial), weight(2))
  return createShare(3, a.setId, 3, Uint8Array.of(y3))
}
