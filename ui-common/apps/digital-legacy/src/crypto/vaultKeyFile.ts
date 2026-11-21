import { LegacyCryptoError } from './errors'
import { VAULT_KEY_BYTES } from './vaultCrypto'
import {
  isPassphraseBlob,
  openWithPassphrase,
  sealWithPassphrase,
  type PassphraseBlob,
} from './passphrase'
import type { Bytes } from './bytes'

const KEY_FILE_AAD = 'digital-legacy/vault-key-file/v1'
const FORMAT = 'digital-legacy-vault-key'

export const MIN_PASSPHRASE_LENGTH = 12

/** The owner's backup of the vault key: the key encrypted under a passphrase only they know. */
export interface VaultKeyFile {
  format: typeof FORMAT
  v: 1
  note: string
  protected: PassphraseBlob
}

export async function createVaultKeyFile(
  vaultKey: Uint8Array,
  passphrase: string,
  iterations?: number,
): Promise<VaultKeyFile> {
  if (passphrase.length < MIN_PASSPHRASE_LENGTH)
    throw new LegacyCryptoError(
      'bad-format',
      `The passphrase must be at least ${MIN_PASSPHRASE_LENGTH} characters`,
    )
  return {
    format: FORMAT,
    v: 1,
    note: 'Your digital-legacy vault key, encrypted with your passphrase. Without this file and the passphrase your own vault cannot be reopened for editing.',
    protected: await sealWithPassphrase(vaultKey, passphrase, KEY_FILE_AAD, iterations),
  }
}

export function parseVaultKeyFile(text: string): VaultKeyFile {
  let parsed: unknown
  try {
    parsed = JSON.parse(text)
  } catch (cause) {
    throw new LegacyCryptoError('bad-format', 'This is not a vault key file', { cause })
  }
  const f = parsed as Partial<VaultKeyFile> | null
  if (!f || f.format !== FORMAT || f.v !== 1 || !isPassphraseBlob(f.protected))
    throw new LegacyCryptoError('bad-format', 'This is not a vault key file')
  return f as VaultKeyFile
}

export async function openVaultKeyFile(file: VaultKeyFile, passphrase: string): Promise<Bytes> {
  const key = await openWithPassphrase(file.protected, passphrase, KEY_FILE_AAD)
  if (key.length !== VAULT_KEY_BYTES)
    throw new LegacyCryptoError('bad-format', 'The file does not contain a valid vault key')
  return key
}

export const serializeVaultKeyFile = (file: VaultKeyFile): string => JSON.stringify(file, null, 2)
