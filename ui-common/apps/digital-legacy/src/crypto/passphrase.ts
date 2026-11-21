import { aesGcmDecrypt, aesGcmEncrypt } from './aesGcm'
import { LegacyCryptoError } from './errors'
import { EncodingError, fromBase64, randomBytes, toBase64, utf8Encode, type Bytes } from './bytes'

/** OWASP's 2023 guidance for PBKDF2-HMAC-SHA256. WebCrypto has no memory-hard KDF to offer instead. */
export const PBKDF2_ITERATIONS = 600_000
const MIN_ITERATIONS = 100_000
const MAX_ITERATIONS = 10_000_000
const SALT_BYTES = 16

/** A secret encrypted under a key derived from a passphrase. Safe to store in a file. */
export interface PassphraseBlob {
  kdf: { name: 'pbkdf2-sha256'; salt: string; iterations: number }
  nonce: string
  ciphertext: string
}

async function deriveKey(passphrase: string, salt: Uint8Array, iterations: number): Promise<Bytes> {
  const material = await globalThis.crypto.subtle.importKey(
    'raw',
    utf8Encode(passphrase.normalize('NFKC')),
    'PBKDF2',
    false,
    ['deriveBits'],
  )
  const bits = await globalThis.crypto.subtle.deriveBits(
    { name: 'PBKDF2', hash: 'SHA-256', salt: salt as Bytes, iterations },
    material,
    256,
  )
  return new Uint8Array(bits)
}

export async function sealWithPassphrase(
  secret: Uint8Array,
  passphrase: string,
  aad: string,
  iterations = PBKDF2_ITERATIONS,
): Promise<PassphraseBlob> {
  const salt = randomBytes(SALT_BYTES)
  const key = await deriveKey(passphrase, salt, iterations)
  const sealed = await aesGcmEncrypt(key, secret, utf8Encode(aad))
  key.fill(0)
  return {
    kdf: { name: 'pbkdf2-sha256', salt: toBase64(salt), iterations },
    nonce: toBase64(sealed.nonce),
    ciphertext: toBase64(sealed.ciphertext),
  }
}

export async function openWithPassphrase(
  blob: PassphraseBlob,
  passphrase: string,
  aad: string,
): Promise<Bytes> {
  const { kdf } = blob
  if (
    kdf.name !== 'pbkdf2-sha256' ||
    !Number.isInteger(kdf.iterations) ||
    kdf.iterations < MIN_ITERATIONS ||
    kdf.iterations > MAX_ITERATIONS
  )
    throw new LegacyCryptoError(
      'unsupported',
      'The file uses key-derivation settings this app rejects',
    )
  let salt: Bytes
  let nonce: Bytes
  let ciphertext: Bytes
  try {
    salt = fromBase64(kdf.salt)
    nonce = fromBase64(blob.nonce)
    ciphertext = fromBase64(blob.ciphertext)
  } catch (cause) {
    if (cause instanceof EncodingError)
      throw new LegacyCryptoError('bad-format', 'The file is damaged', { cause })
    throw cause
  }
  const key = await deriveKey(passphrase, salt, kdf.iterations)
  try {
    return await aesGcmDecrypt(key, nonce, ciphertext, utf8Encode(aad))
  } catch (cause) {
    throw new LegacyCryptoError('wrong-passphrase', 'Wrong passphrase, or the file was altered', {
      cause,
    })
  } finally {
    key.fill(0)
  }
}

export function isPassphraseBlob(value: unknown): value is PassphraseBlob {
  if (typeof value !== 'object' || value === null) return false
  const v = value as Record<string, unknown>
  const kdf = v.kdf as Record<string, unknown> | undefined
  return (
    typeof kdf === 'object' &&
    kdf !== null &&
    kdf.name === 'pbkdf2-sha256' &&
    typeof kdf.salt === 'string' &&
    typeof kdf.iterations === 'number' &&
    typeof v.nonce === 'string' &&
    typeof v.ciphertext === 'string'
  )
}
