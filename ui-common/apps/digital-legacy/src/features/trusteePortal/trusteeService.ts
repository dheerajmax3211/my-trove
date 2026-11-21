import type { TrusteeApi } from '../../api/trusteeApi'
import type { AcceptResponse, Contact, TrusteeCiphertextView } from '../../api/types'
import {
  combine,
  decryptVault,
  decodeShare,
  fingerprintOf,
  LegacyCryptoError,
  openShare,
  parseDocument,
  shareToText,
  toBase64,
  type Share,
  type TrusteeKeyMaterial,
  type VaultDocument,
} from '../../crypto'

export interface Registration {
  response: AcceptResponse
  /** False means the server recorded a different key than the one generated here: a red flag. */
  fingerprintMatches: boolean
}

/** Registers the public half only; the private key never leaves the browser. */
export async function registerTrustee(
  api: TrusteeApi,
  input: { inviteToken: string; contacts: Contact[]; material: TrusteeKeyMaterial },
): Promise<Registration> {
  const response = await api.accept({
    inviteToken: input.inviteToken.trim(),
    keyAlgorithm: input.material.algorithm,
    publicKey: toBase64(input.material.publicKey),
    contacts: input.contacts,
  })
  const local = await fingerprintOf(input.material.publicKey)
  return { response, fingerprintMatches: response.keyFingerprint === local }
}

export interface UnsealedShare {
  share: Share
  text: string
}

/**
 * Fetches the sealed share (only possible once RELEASED) and opens it with the trustee's key.
 * The key file must be the one registered: its fingerprint is compared with the server's record so
 * the failure is explained instead of surfacing as a bare decryption error.
 */
export async function retrieveShare(
  api: TrusteeApi,
  key: TrusteeKeyMaterial,
): Promise<UnsealedShare> {
  const [me, sealed] = await Promise.all([api.me(), api.getShare()])
  const fingerprint = await fingerprintOf(key.publicKey)
  if (me.keyFingerprint && me.keyFingerprint !== fingerprint)
    throw new LegacyCryptoError(
      'key-mismatch',
      'This key file does not belong to your registration: its fingerprint differs from the key you registered.',
    )
  const bytes = await openShare(sealed.sealedShare, key, {
    vaultId: sealed.vaultId,
    trusteeId: sealed.trusteeId,
    vaultVersion: sealed.vaultVersion,
  })
  const share = decodeShare(bytes)
  return { share, text: shareToText(share) }
}

/** Rebuilds the vault key from t shares and decrypts the released ciphertext. */
export async function decryptReleasedVault(
  shares: readonly Share[],
  ciphertext: TrusteeCiphertextView,
): Promise<VaultDocument> {
  const key = combine(shares)
  try {
    return parseDocument(await decryptVault(key, ciphertext.ciphertext, ciphertext.metadata))
  } catch (cause) {
    if (cause instanceof LegacyCryptoError && cause.code === 'wrong-key')
      throw new LegacyCryptoError(
        'wrong-key',
        'These shares combine, but the result does not open the vault. A share is wrong or damaged, or the shares are from an older key version.',
        { cause },
      )
    throw cause
  } finally {
    key.fill(0)
  }
}
