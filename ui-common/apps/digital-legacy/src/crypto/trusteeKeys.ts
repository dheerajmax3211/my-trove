import { LegacyCryptoError } from './errors'
import { bytesOf, fromBase64, fromHex, toBase64, toHex, EncodingError, type Bytes } from './bytes'
import {
  isPassphraseBlob,
  openWithPassphrase,
  sealWithPassphrase,
  type PassphraseBlob,
} from './passphrase'

export type KeyAlgorithm = 'X25519' | 'RSA-OAEP'

/** RFC 8410 SubjectPublicKeyInfo prefix of an X25519 key; the 32 raw key bytes follow. */
const X25519_SPKI_PREFIX = fromHex('302a300506032b656e032100')
const X25519_SPKI_LENGTH = 44
const RSA_BITS = 3072

const subtle = () => globalThis.crypto.subtle

export interface TrusteeKeyMaterial {
  algorithm: KeyAlgorithm
  /** X.509 SubjectPublicKeyInfo DER: what the server stores and the fingerprint is computed over. */
  publicKey: Bytes
  /** PKCS#8 DER. Exists only in memory and in the file the trustee downloads. */
  privateKey: Bytes
}

/**
 * Generates the trustee's keypair in the browser. X25519 is preferred (small, fast); browsers without
 * WebCrypto X25519 fall back to RSA-OAEP-3072, which the server also accepts.
 */
export async function generateTrusteeKeyPair(): Promise<TrusteeKeyMaterial> {
  let algorithm: KeyAlgorithm = 'X25519'
  let pair: CryptoKeyPair
  try {
    pair = await subtle().generateKey({ name: 'X25519' }, true, ['deriveBits'])
  } catch {
    algorithm = 'RSA-OAEP'
    pair = await subtle().generateKey(
      {
        name: 'RSA-OAEP',
        modulusLength: RSA_BITS,
        publicExponent: new Uint8Array([1, 0, 1]),
        hash: 'SHA-256',
      },
      true,
      ['encrypt', 'decrypt'],
    )
  }
  return {
    algorithm,
    publicKey: new Uint8Array(await subtle().exportKey('spki', pair.publicKey)),
    privateKey: new Uint8Array(await subtle().exportKey('pkcs8', pair.privateKey)),
  }
}

/** SHA-256 of the SPKI, lowercase hex: byte-for-byte what the server reports as `keyFingerprint`. */
export async function fingerprintOf(publicKey: Uint8Array): Promise<string> {
  return toHex(new Uint8Array(await subtle().digest('SHA-256', publicKey as Bytes)))
}

/** `ab12 cd34 ...`: groups of four characters, for reading aloud or comparing by eye. */
export function formatFingerprint(hex: string): string {
  return (hex.match(/.{1,4}/g) ?? []).join(' ')
}

/** Short code (first 8 bytes) for a quick spoken comparison; the full value is what actually counts. */
export function shortFingerprint(hex: string): string {
  return formatFingerprint(hex.slice(0, 16))
}

export function x25519Raw(spki: Uint8Array): Bytes {
  if (
    spki.length !== X25519_SPKI_LENGTH ||
    !X25519_SPKI_PREFIX.every((byte, i) => spki[i] === byte)
  )
    throw new LegacyCryptoError('bad-format', 'Not a valid X25519 public key')
  return bytesOf(spki.subarray(X25519_SPKI_PREFIX.length))
}

/** Throws unless `publicKeyBase64` is a well-formed key of the claimed algorithm. */
export async function parsePublicKey(algorithm: string, publicKeyBase64: string): Promise<Bytes> {
  let spki: Bytes
  try {
    spki = fromBase64(publicKeyBase64)
  } catch (cause) {
    if (cause instanceof EncodingError)
      throw new LegacyCryptoError('bad-format', 'The trustee public key is not valid Base64', {
        cause,
      })
    throw cause
  }
  if (algorithm === 'X25519') {
    x25519Raw(spki)
  } else if (algorithm === 'RSA-OAEP') {
    try {
      await importRsaPublic(spki)
    } catch (cause) {
      throw new LegacyCryptoError('bad-format', 'Not a valid RSA public key', { cause })
    }
  } else {
    throw new LegacyCryptoError('unsupported', `Unsupported key algorithm ${algorithm}`)
  }
  return spki
}

export function importRsaPublic(spki: Uint8Array): Promise<CryptoKey> {
  return subtle().importKey('spki', spki as Bytes, { name: 'RSA-OAEP', hash: 'SHA-256' }, false, [
    'encrypt',
  ])
}

// ---- the trustee's key file ---------------------------------------------------------------------

const FORMAT = 'digital-legacy-trustee-key'
const KEY_FILE_AAD = 'digital-legacy/trustee-key-file/v1'

type PrivateKeyEnvelope =
  { protection: 'none'; pkcs8: string } | ({ protection: 'passphrase' } & PassphraseBlob)

export interface TrusteeKeyFile {
  format: typeof FORMAT
  v: 1
  note: string
  algorithm: KeyAlgorithm
  publicKey: string
  fingerprint: string
  privateKey: PrivateKeyEnvelope
}

export async function createTrusteeKeyFile(
  material: TrusteeKeyMaterial,
  passphrase: string | null,
  iterations?: number,
): Promise<TrusteeKeyFile> {
  const privateKey: PrivateKeyEnvelope = passphrase
    ? {
        protection: 'passphrase',
        ...(await sealWithPassphrase(material.privateKey, passphrase, KEY_FILE_AAD, iterations)),
      }
    : { protection: 'none', pkcs8: toBase64(material.privateKey) }
  return {
    format: FORMAT,
    v: 1,
    note: 'Your private key for the digital-legacy portal. Keep it safe and never share it. If it is lost, your share can never be opened.',
    algorithm: material.algorithm,
    publicKey: toBase64(material.publicKey),
    fingerprint: await fingerprintOf(material.publicKey),
    privateKey,
  }
}

export function parseTrusteeKeyFile(text: string): TrusteeKeyFile {
  let parsed: unknown
  try {
    parsed = JSON.parse(text)
  } catch (cause) {
    throw new LegacyCryptoError('bad-format', 'This is not a trustee key file', { cause })
  }
  const f = parsed as Partial<TrusteeKeyFile> | null
  const pk = f?.privateKey as Record<string, unknown> | undefined
  const validProtection =
    pk?.protection === 'none'
      ? typeof pk.pkcs8 === 'string'
      : pk?.protection === 'passphrase' && isPassphraseBlob(pk)
  if (
    !f ||
    f.format !== FORMAT ||
    f.v !== 1 ||
    (f.algorithm !== 'X25519' && f.algorithm !== 'RSA-OAEP') ||
    typeof f.publicKey !== 'string' ||
    typeof f.fingerprint !== 'string' ||
    !validProtection
  )
    throw new LegacyCryptoError('bad-format', 'This is not a trustee key file')
  return f as TrusteeKeyFile
}

export function trusteeKeyFileNeedsPassphrase(file: TrusteeKeyFile): boolean {
  return file.privateKey.protection === 'passphrase'
}

/** Unlocks the file and checks that the public half really hashes to the fingerprint it claims. */
export async function openTrusteeKeyFile(
  file: TrusteeKeyFile,
  passphrase: string | null,
): Promise<TrusteeKeyMaterial> {
  let privateKey: Bytes
  if (file.privateKey.protection === 'none') {
    try {
      privateKey = fromBase64(file.privateKey.pkcs8)
    } catch (cause) {
      throw new LegacyCryptoError('bad-format', 'The key file is damaged', { cause })
    }
  } else {
    if (!passphrase)
      throw new LegacyCryptoError('wrong-passphrase', 'This key file needs its passphrase')
    privateKey = await openWithPassphrase(file.privateKey, passphrase, KEY_FILE_AAD)
  }
  const publicKey = await parsePublicKey(file.algorithm, file.publicKey)
  if ((await fingerprintOf(publicKey)) !== file.fingerprint)
    throw new LegacyCryptoError(
      'bad-format',
      'The key file is inconsistent: its fingerprint does not match its public key',
    )
  return { algorithm: file.algorithm, publicKey, privateKey }
}

export const serializeTrusteeKeyFile = (file: TrusteeKeyFile): string =>
  JSON.stringify(file, null, 2)
