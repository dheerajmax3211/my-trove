import type { OwnerApi } from '../../api/ownerApi'
import type { VaultSummary } from '../../api/types'
import {
  decryptVault,
  encryptVault,
  MAX_CIPHERTEXT_BYTES,
  parseDocument,
  serializeDocument,
  type VaultDocument,
} from '../../crypto'

/** Plaintext size above which the encrypted vault would exceed the server's limit (16 bytes of tag). */
export const MAX_PLAINTEXT_BYTES = MAX_CIPHERTEXT_BYTES - 16

export function documentSize(doc: VaultDocument): number {
  return serializeDocument(doc).length
}

/**
 * Encrypts in the browser and uploads. The request body contains only the Base64 ciphertext and
 * `{v, alg, nonce}`: never the document and never the key.
 */
export async function saveVault(
  api: OwnerApi,
  key: Uint8Array,
  doc: VaultDocument,
  mode: 'create' | 'update' | 'rotate',
): Promise<VaultSummary> {
  const encrypted = await encryptVault(key, serializeDocument(doc))
  return mode === 'create'
    ? api.createVault(encrypted)
    : api.updateVault({ ...encrypted, keyRotated: mode === 'rotate' })
}

/** Downloads the owner's own ciphertext and decrypts it locally. Throws `wrong-key` for a wrong key. */
export async function openVault(api: OwnerApi, key: Uint8Array): Promise<VaultDocument> {
  const blob = await api.getCiphertext()
  if (blob.ciphertext === null)
    throw new Error('There is no vault to open yet')
  return parseDocument(await decryptVault(key, blob.ciphertext, blob.metadata))
}
