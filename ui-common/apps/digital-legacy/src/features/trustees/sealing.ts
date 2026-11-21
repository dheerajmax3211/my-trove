import type { OwnerApi } from '../../api/ownerApi'
import type { TrusteeView } from '../../api/types'
import {
  encodeShare,
  fingerprintOf,
  LegacyCryptoError,
  parsePublicKey,
  sealShare,
  split,
  type KeyAlgorithm,
} from '../../crypto'

export interface SealContext {
  api: OwnerApi
  vaultId: string
  vaultVersion: number
  vaultKey: Uint8Array
  trustees: readonly TrusteeView[]
  /** The quorum: how many shares are needed to rebuild the vault key. */
  threshold: number
  onProgress?: (trusteeId: string, status: 'sealing' | 'uploaded' | 'failed') => void
}

export interface SealOutcome {
  trusteeId: string
  label: string
  ok: boolean
  error?: unknown
}

/** Trustees that have registered a key can hold a share; invited and revoked ones cannot. */
export function eligibleForShare(trustees: readonly TrusteeView[]): TrusteeView[] {
  return trustees.filter((t) => t.status !== 'REVOKED' && t.status !== 'INVITED' && t.publicKey)
}

/**
 * Splits the vault key t-of-n (n = every trustee holding a key) and uploads each share sealed to
 * its trustee's public key. A new split replaces every earlier one, so all eligible trustees are
 * always re-sealed together: shares of different splits cannot be mixed.
 *
 * Before sealing, the key the server returned is checked against the fingerprint the server
 * reported for it; the owner's out-of-band comparison with the trustee covers the rest.
 */
export async function sealAndUploadShares(ctx: SealContext): Promise<SealOutcome[]> {
  const holders = eligibleForShare(ctx.trustees)
  if (ctx.threshold < 1 || ctx.threshold > holders.length)
    throw new LegacyCryptoError(
      'bad-format',
      `The quorum is ${ctx.threshold} but only ${holders.length} trustee(s) have registered a key.`,
    )
  const recipients = await Promise.all(
    holders.map(async (t) => {
      const algorithm = t.keyAlgorithm as KeyAlgorithm
      const publicKey = await parsePublicKey(algorithm, t.publicKey ?? '')
      if ((await fingerprintOf(publicKey)) !== t.keyFingerprint)
        throw new LegacyCryptoError(
          'key-mismatch',
          `The public key the server returned for ${t.label} does not match its own fingerprint. Do not continue.`,
        )
      return { trustee: t, algorithm, publicKey }
    }),
  )
  const shares = split(ctx.vaultKey, recipients.length, ctx.threshold)
  const outcomes: SealOutcome[] = []
  for (const [i, r] of recipients.entries()) {
    const share = shares[i]
    if (!share) continue
    ctx.onProgress?.(r.trustee.id, 'sealing')
    try {
      const sealed = await sealShare(
        encodeShare(share),
        { algorithm: r.algorithm, publicKey: r.publicKey },
        { vaultId: ctx.vaultId, trusteeId: r.trustee.id, vaultVersion: ctx.vaultVersion },
      )
      await ctx.api.uploadShare(r.trustee.id, {
        sealedShare: sealed,
        vaultVersion: ctx.vaultVersion,
      })
      ctx.onProgress?.(r.trustee.id, 'uploaded')
      outcomes.push({ trusteeId: r.trustee.id, label: r.trustee.label, ok: true })
    } catch (error) {
      ctx.onProgress?.(r.trustee.id, 'failed')
      outcomes.push({ trusteeId: r.trustee.id, label: r.trustee.label, ok: false, error })
    }
  }
  return outcomes
}
