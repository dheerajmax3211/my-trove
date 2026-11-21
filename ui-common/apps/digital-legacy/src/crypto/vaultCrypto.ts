import { aesGcmDecrypt, aesGcmEncrypt } from './aesGcm'
import { LegacyCryptoError } from './errors'
import {
  EncodingError,
  fromBase64,
  randomBytes,
  toBase64,
  utf8Decode,
  utf8Encode,
  type Bytes,
} from './bytes'

/** Associated data bound into every vault ciphertext (matches the server's reference client). */
export const VAULT_AAD = 'digital-legacy/vault/v1'
export const VAULT_KEY_BYTES = 32
/** The server's default limit on the ciphertext blob. */
export const MAX_CIPHERTEXT_BYTES = 1_048_576

/** The only metadata this client sends: format version, algorithm and nonce. */
export interface VaultMetadata {
  v: 1
  alg: 'AES-256-GCM'
  nonce: string
}

export interface EncryptedVault {
  /** Base64 of ciphertext || tag. */
  ciphertext: string
  metadata: VaultMetadata
}

export function generateVaultKey(): Bytes {
  return randomBytes(VAULT_KEY_BYTES)
}

export async function encryptVault(
  key: Uint8Array,
  plaintext: Uint8Array,
): Promise<EncryptedVault> {
  const sealed = await aesGcmEncrypt(key, plaintext, utf8Encode(VAULT_AAD))
  return {
    ciphertext: toBase64(sealed.ciphertext),
    metadata: { v: 1, alg: 'AES-256-GCM', nonce: toBase64(sealed.nonce) },
  }
}

export async function decryptVault(
  key: Uint8Array,
  ciphertextBase64: string,
  metadata: { alg?: unknown; nonce?: unknown; v?: unknown },
): Promise<Bytes> {
  if (metadata.alg !== 'AES-256-GCM' || metadata.v !== 1 || typeof metadata.nonce !== 'string')
    throw new LegacyCryptoError(
      'unsupported',
      'This vault uses a format this app does not understand',
    )
  try {
    return await aesGcmDecrypt(
      key,
      fromBase64(metadata.nonce),
      fromBase64(ciphertextBase64),
      utf8Encode(VAULT_AAD),
    )
  } catch (cause) {
    if (cause instanceof EncodingError)
      throw new LegacyCryptoError('bad-format', 'The stored ciphertext is damaged', { cause })
    throw cause
  }
}

// ---- the plaintext document ---------------------------------------------------------------------

export interface VaultEntry {
  id: string
  title: string
  body: string
}

export interface VaultDocument {
  v: 1
  entries: VaultEntry[]
}

export function serializeDocument(doc: VaultDocument): Bytes {
  return utf8Encode(JSON.stringify(doc))
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

export function parseDocument(bytes: Uint8Array): VaultDocument {
  let parsed: unknown
  try {
    parsed = JSON.parse(utf8Decode(bytes))
  } catch (cause) {
    throw new LegacyCryptoError('bad-format', 'The decrypted vault is not a readable document', {
      cause,
    })
  }
  if (!isRecord(parsed) || parsed.v !== 1 || !Array.isArray(parsed.entries))
    throw new LegacyCryptoError('bad-format', 'The decrypted vault is not a readable document')
  const entries: VaultEntry[] = []
  for (const raw of parsed.entries as unknown[]) {
    if (!isRecord(raw) || typeof raw.title !== 'string' || typeof raw.body !== 'string')
      throw new LegacyCryptoError('bad-format', 'The decrypted vault has a malformed entry')
    entries.push({
      id: typeof raw.id === 'string' ? raw.id : globalThis.crypto.randomUUID(),
      title: raw.title,
      body: raw.body,
    })
  }
  return { v: 1, entries }
}
