import { LegacyCryptoError } from './errors'
import { randomBytes, type Bytes } from './bytes'

export const GCM_NONCE_BYTES = 12
export const GCM_TAG_BYTES = 16

const subtle = () => globalThis.crypto.subtle

async function importAesKey(raw: Uint8Array, usage: 'encrypt' | 'decrypt'): Promise<CryptoKey> {
  if (raw.length !== 32)
    throw new LegacyCryptoError('bad-format', 'An AES-256 key must be 32 bytes')
  return subtle().importKey('raw', raw as Bytes, { name: 'AES-GCM' }, false, [usage])
}

export interface Sealed {
  nonce: Bytes
  /** ciphertext || 16-byte tag, exactly what the server stores and Java produces. */
  ciphertext: Bytes
}

export async function aesGcmEncrypt(
  key: Uint8Array,
  plaintext: Uint8Array,
  aad: Uint8Array,
): Promise<Sealed> {
  const nonce = randomBytes(GCM_NONCE_BYTES)
  const cryptoKey = await importAesKey(key, 'encrypt')
  const out = await subtle().encrypt(
    { name: 'AES-GCM', iv: nonce, additionalData: aad as Bytes, tagLength: 128 },
    cryptoKey,
    plaintext as Bytes,
  )
  return { nonce, ciphertext: new Uint8Array(out) }
}

/** Throws a `wrong-key` error when authentication fails (wrong key, wrong AAD or altered bytes). */
export async function aesGcmDecrypt(
  key: Uint8Array,
  nonce: Uint8Array,
  ciphertext: Uint8Array,
  aad: Uint8Array,
): Promise<Bytes> {
  if (nonce.length !== GCM_NONCE_BYTES)
    throw new LegacyCryptoError('bad-format', 'The nonce must be 12 bytes')
  if (ciphertext.length < GCM_TAG_BYTES)
    throw new LegacyCryptoError('bad-format', 'The ciphertext is too short to be valid')
  const cryptoKey = await importAesKey(key, 'decrypt')
  try {
    const out = await subtle().decrypt(
      { name: 'AES-GCM', iv: nonce as Bytes, additionalData: aad as Bytes, tagLength: 128 },
      cryptoKey,
      ciphertext as Bytes,
    )
    return new Uint8Array(out)
  } catch (cause) {
    throw new LegacyCryptoError('wrong-key', 'Decryption failed: wrong key or altered data', {
      cause,
    })
  }
}
