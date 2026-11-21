import { aesGcmDecrypt, aesGcmEncrypt } from './aesGcm'
import { LegacyCryptoError } from './errors'
import {
  importRsaPublic,
  x25519Raw,
  type KeyAlgorithm,
  type TrusteeKeyMaterial,
} from './trusteeKeys'
import {
  concat,
  EncodingError,
  fromBase64,
  randomBytes,
  toBase64,
  utf8Encode,
  type Bytes,
} from './bytes'

export const SHARE_INFO = 'digital-legacy/share/v1'
export const ALG_X25519 = 'X25519-HKDF-SHA256-AES256GCM'
export const ALG_RSA = 'RSA-OAEP-SHA256-AES256GCM'

const subtle = () => globalThis.crypto.subtle

/** A share sealed to one trustee's public key. The server stores it opaquely. */
export type SealedShare =
  | { v: 1; alg: typeof ALG_X25519; epk: string; nonce: string; ct: string }
  | { v: 1; alg: typeof ALG_RSA; ek: string; nonce: string; ct: string }

export interface ShareContext {
  vaultId: string
  trusteeId: string
  vaultVersion: number
}

/**
 * Binds a sealed share to its place: another trustee, vault or key version cannot reuse it, and the
 * server cannot hand trustee A's envelope to trustee B and have it open.
 */
export function shareAad(ctx: ShareContext): Bytes {
  return utf8Encode(`${SHARE_INFO}|${ctx.vaultId}|${ctx.trusteeId}|${ctx.vaultVersion}`)
}

/** HKDF-SHA256 (RFC 5869) to 32 bytes, with the salt and info the server's reference client uses. */
async function hkdf(sharedSecret: Uint8Array, salt: Uint8Array): Promise<Bytes> {
  const material = await subtle().importKey('raw', sharedSecret as Bytes, 'HKDF', false, [
    'deriveBits',
  ])
  const bits = await subtle().deriveBits(
    { name: 'HKDF', hash: 'SHA-256', salt: salt as Bytes, info: utf8Encode(SHARE_INFO) },
    material,
    256,
  )
  return new Uint8Array(bits)
}

async function ecdh(privateKey: CryptoKey, peerRaw: Uint8Array): Promise<Bytes> {
  const peer = await subtle().importKey('raw', peerRaw as Bytes, { name: 'X25519' }, false, [])
  return new Uint8Array(
    await subtle().deriveBits({ name: 'X25519', public: peer }, privateKey, 256),
  )
}

/** Seals the encoded Shamir share to a trustee's registered public key. */
export async function sealShare(
  share: Uint8Array,
  recipient: { algorithm: KeyAlgorithm; publicKey: Uint8Array },
  ctx: ShareContext,
): Promise<SealedShare> {
  const aad = shareAad(ctx)
  if (recipient.algorithm === 'X25519') {
    const recipientRaw = x25519Raw(recipient.publicKey)
    const eph = await subtle().generateKey({ name: 'X25519' }, true, ['deriveBits'])
    const epk = new Uint8Array(await subtle().exportKey('raw', eph.publicKey))
    const cek = await hkdf(await ecdh(eph.privateKey, recipientRaw), concat(epk, recipientRaw))
    const sealed = await aesGcmEncrypt(cek, share, aad)
    cek.fill(0)
    return {
      v: 1,
      alg: ALG_X25519,
      epk: toBase64(epk),
      nonce: toBase64(sealed.nonce),
      ct: toBase64(sealed.ciphertext),
    }
  }
  const cek = randomBytes(32)
  const ek = new Uint8Array(
    await subtle().encrypt({ name: 'RSA-OAEP' }, await importRsaPublic(recipient.publicKey), cek),
  )
  const sealed = await aesGcmEncrypt(cek, share, aad)
  cek.fill(0)
  return {
    v: 1,
    alg: ALG_RSA,
    ek: toBase64(ek),
    nonce: toBase64(sealed.nonce),
    ct: toBase64(sealed.ciphertext),
  }
}

function field(envelope: Record<string, unknown>, name: string): Bytes {
  const value = envelope[name]
  if (typeof value !== 'string')
    throw new LegacyCryptoError('bad-format', `The sealed share has no ${name}`)
  try {
    return fromBase64(value)
  } catch (cause) {
    if (cause instanceof EncodingError)
      throw new LegacyCryptoError('bad-format', `The sealed share's ${name} is damaged`, { cause })
    throw cause
  }
}

/**
 * Opens a sealed share with the trustee's private key. Fails with `key-mismatch` when the key file
 * is of the wrong algorithm for this envelope and `wrong-key` when it simply cannot open it.
 */
export async function openShare(
  envelope: Record<string, unknown>,
  key: TrusteeKeyMaterial,
  ctx: ShareContext,
): Promise<Bytes> {
  const expected = key.algorithm === 'X25519' ? ALG_X25519 : ALG_RSA
  if (envelope.alg !== ALG_X25519 && envelope.alg !== ALG_RSA)
    throw new LegacyCryptoError(
      'unsupported',
      'The sealed share uses a format this app does not understand',
    )
  if (envelope.alg !== expected)
    throw new LegacyCryptoError(
      'key-mismatch',
      'This key file is of a different type than the key your share was sealed to',
    )
  const nonce = field(envelope, 'nonce')
  const ct = field(envelope, 'ct')
  const aad = shareAad(ctx)
  let cek: Bytes
  try {
    if (key.algorithm === 'X25519') {
      const epk = field(envelope, 'epk')
      const priv = await subtle().importKey('pkcs8', key.privateKey, { name: 'X25519' }, false, [
        'deriveBits',
      ])
      cek = await hkdf(await ecdh(priv, epk), concat(epk, x25519Raw(key.publicKey)))
    } else {
      const priv = await subtle().importKey(
        'pkcs8',
        key.privateKey,
        { name: 'RSA-OAEP', hash: 'SHA-256' },
        false,
        ['decrypt'],
      )
      cek = new Uint8Array(
        await subtle().decrypt({ name: 'RSA-OAEP' }, priv, field(envelope, 'ek')),
      )
    }
  } catch (cause) {
    if (cause instanceof LegacyCryptoError) throw cause
    throw new LegacyCryptoError('wrong-key', 'This key cannot open the share', { cause })
  }
  try {
    return await aesGcmDecrypt(cek, nonce, ct, aad)
  } finally {
    cek.fill(0)
  }
}
