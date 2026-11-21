/** Byte helpers shared by the crypto modules. Everything here is synchronous and side-effect free. */

/** A byte array backed by a plain ArrayBuffer: the shape WebCrypto accepts as a BufferSource. */
export type Bytes = Uint8Array<ArrayBuffer>

const encoder = new TextEncoder()
const decoder = new TextDecoder('utf-8', { fatal: true })

/** Copies into a fresh, plain-ArrayBuffer-backed array (also normalises subarray views). */
export function bytesOf(source: ArrayLike<number>): Bytes {
  const out = new Uint8Array(new ArrayBuffer(source.length))
  out.set(source)
  return out
}

export function utf8Encode(text: string): Bytes {
  return bytesOf(encoder.encode(text))
}

/** Strict UTF-8 decode: throws on invalid sequences instead of silently substituting. */
export function utf8Decode(bytes: Uint8Array): string {
  return decoder.decode(bytes)
}

export function concat(...parts: Uint8Array[]): Bytes {
  const out = new Uint8Array(new ArrayBuffer(parts.reduce((sum, p) => sum + p.length, 0)))
  let offset = 0
  for (const part of parts) {
    out.set(part, offset)
    offset += part.length
  }
  return out
}

export function equalBytes(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false
  let diff = 0
  for (let i = 0; i < a.length; i++) diff |= (a[i] ?? 0) ^ (b[i] ?? 0)
  return diff === 0
}

export function randomBytes(length: number): Bytes {
  const out = new Uint8Array(new ArrayBuffer(length))
  globalThis.crypto.getRandomValues(out)
  return out
}

const BASE64 = /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/

/** Standard Base64 with padding: the encoding the server validates. */
export function toBase64(bytes: Uint8Array): string {
  let binary = ''
  const chunk = 0x8000
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk))
  }
  return btoa(binary)
}

export class EncodingError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'EncodingError'
  }
}

/** Strict decode: rejects missing padding, URL-safe alphabets, whitespace and stray characters. */
export function fromBase64(text: string): Bytes {
  if (!BASE64.test(text)) throw new EncodingError('Value is not valid Base64')
  const binary = atob(text)
  const out = new Uint8Array(new ArrayBuffer(binary.length))
  for (let i = 0; i < binary.length; i++) out[i] = binary.charCodeAt(i)
  return out
}

export function toHex(bytes: Uint8Array): string {
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('')
}

export function fromHex(text: string): Bytes {
  if (text.length % 2 !== 0 || !/^[0-9a-fA-F]*$/.test(text))
    throw new EncodingError('Value is not valid hex')
  const out = new Uint8Array(new ArrayBuffer(text.length / 2))
  for (let i = 0; i < out.length; i++) out[i] = parseInt(text.slice(i * 2, i * 2 + 2), 16)
  return out
}
