/**
 * Arithmetic in GF(2^8) with the AES reduction polynomial x^8 + x^4 + x^3 + x + 1 (0x11b), using
 * log/antilog tables built from the generator 3. A line-for-line port of the server's reference
 * `Gf256.java`; addition and subtraction are both XOR.
 *
 * Table lookups are not constant time. That is acceptable here: the secret is a random vault key and
 * the code runs on the user's own machine (see the README threat model).
 */

const EXP = new Uint8Array(510)
const LOG = new Uint8Array(256)

function xtime(x: number): number {
  let r = x << 1
  if ((r & 0x100) !== 0) r ^= 0x11b
  return r & 0xff
}

{
  let x = 1
  for (let i = 0; i < 255; i++) {
    EXP[i] = x
    LOG[x] = i
    x = x ^ xtime(x) // multiply by the generator 3
  }
  for (let i = 255; i < 510; i++) EXP[i] = EXP[i - 255] ?? 0
}

export function gfAdd(a: number, b: number): number {
  return (a ^ b) & 0xff
}

export function gfMul(a: number, b: number): number {
  if (a === 0 || b === 0) return 0
  return EXP[(LOG[a & 0xff] ?? 0) + (LOG[b & 0xff] ?? 0)] ?? 0
}

export function gfInv(a: number): number {
  if ((a & 0xff) === 0) throw new RangeError('0 has no multiplicative inverse in GF(256)')
  return EXP[255 - (LOG[a & 0xff] ?? 0)] ?? 0
}

export function gfDiv(a: number, b: number): number {
  return gfMul(a, gfInv(b))
}
