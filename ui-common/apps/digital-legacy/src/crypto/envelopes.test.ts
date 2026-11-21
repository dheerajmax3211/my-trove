import { describe, expect, it } from 'vitest'
import vectors from './__fixtures__/javaVectors.json'
import { fromBase64, fromHex, toBase64, toHex, utf8Decode, utf8Encode } from './bytes'
import { isCryptoError } from './errors'
import {
  ALG_RSA,
  ALG_X25519,
  openShare,
  sealShare,
  shareAad,
  type SealedShare,
} from './shareEnvelope'
import {
  fingerprintOf,
  formatFingerprint,
  generateTrusteeKeyPair,
  parsePublicKey,
  shortFingerprint,
  type TrusteeKeyMaterial,
} from './trusteeKeys'
import { combine, decodeShare, encodeShare, split } from './shamir'
import {
  decryptVault,
  encryptVault,
  generateVaultKey,
  parseDocument,
  serializeDocument,
} from './vaultCrypto'

const ctx = {
  vaultId: vectors.envelopes.vaultId,
  trusteeId: vectors.envelopes.trusteeId,
  vaultVersion: vectors.envelopes.vaultVersion,
}

function javaKey(kind: 'x25519' | 'rsa'): TrusteeKeyMaterial {
  const k = vectors.envelopes[kind]
  return {
    algorithm: k.algorithm as TrusteeKeyMaterial['algorithm'],
    publicKey: fromBase64(k.publicKey),
    privateKey: fromBase64(k.privateKeyPkcs8),
  }
}

const rejectsWith = (code: Parameters<typeof isCryptoError>[1]) => (e: unknown) =>
  isCryptoError(e, code)

describe('vault encryption', () => {
  it('opens a vault that the Java reference client encrypted', async () => {
    const plain = await decryptVault(
      fromHex(vectors.envelopes.vaultKey),
      vectors.envelopes.vault.ciphertext,
      { v: 1, alg: 'AES-256-GCM', nonce: vectors.envelopes.vault.nonce },
    )
    expect(utf8Decode(plain)).toBe(vectors.envelopes.plaintext)
  })

  it('produces exactly the metadata the server accepts, with ciphertext = data + 16-byte tag', async () => {
    const key = generateVaultKey()
    const plaintext = utf8Encode('hello')
    const enc = await encryptVault(key, plaintext)
    expect(Object.keys(enc.metadata).sort()).toEqual(['alg', 'nonce', 'v'])
    expect(enc.metadata.v).toBe(1)
    expect(enc.metadata.alg).toBe('AES-256-GCM')
    expect(fromBase64(enc.metadata.nonce)).toHaveLength(12)
    expect(fromBase64(enc.ciphertext)).toHaveLength(plaintext.length + 16)
    expect(utf8Decode(await decryptVault(key, enc.ciphertext, enc.metadata))).toBe('hello')
  })

  it('never reuses a nonce and never leaks the plaintext into the ciphertext', async () => {
    const key = generateVaultKey()
    const a = await encryptVault(key, utf8Encode('same'))
    const b = await encryptVault(key, utf8Encode('same'))
    expect(a.metadata.nonce).not.toBe(b.metadata.nonce)
    expect(a.ciphertext).not.toBe(b.ciphertext)
    expect(atob(a.ciphertext)).not.toContain('same')
  })

  it('fails with wrong-key for a wrong key, a flipped bit or a swapped nonce', async () => {
    const key = generateVaultKey()
    const enc = await encryptVault(key, utf8Encode('secret'))
    await expect(decryptVault(generateVaultKey(), enc.ciphertext, enc.metadata)).rejects.toSatisfy(
      rejectsWith('wrong-key'),
    )
    const raw = fromBase64(enc.ciphertext)
    raw[0] = (raw[0] ?? 0) ^ 1
    await expect(decryptVault(key, toBase64(raw), enc.metadata)).rejects.toSatisfy(
      rejectsWith('wrong-key'),
    )
    const other = await encryptVault(key, utf8Encode('x'))
    await expect(
      decryptVault(key, enc.ciphertext, { ...enc.metadata, nonce: other.metadata.nonce }),
    ).rejects.toSatisfy(rejectsWith('wrong-key'))
  })

  it('rejects unknown formats and damaged Base64', async () => {
    const key = generateVaultKey()
    const enc = await encryptVault(key, utf8Encode('s'))
    await expect(decryptVault(key, enc.ciphertext, { ...enc.metadata, v: 2 })).rejects.toSatisfy(
      rejectsWith('unsupported'),
    )
    await expect(decryptVault(key, 'not base64!', enc.metadata)).rejects.toSatisfy(
      rejectsWith('bad-format'),
    )
  })

  it('round-trips the document format and rejects documents that are not ours', () => {
    const doc = { v: 1 as const, entries: [{ id: 'a', title: 'Bank', body: 'PIN: 4321' }] }
    expect(parseDocument(serializeDocument(doc))).toEqual(doc)
    expect(() => parseDocument(utf8Encode('{"v":2}'))).toThrow(/not a readable document/)
    expect(() => parseDocument(utf8Encode('nope'))).toThrow(/not a readable document/)
    expect(() => parseDocument(utf8Encode('{"v":1,"entries":[{"title":1}]}'))).toThrow(
      /malformed entry/,
    )
  })
})

describe('sealed shares: interoperability with the Java reference client', () => {
  it.each(['x25519', 'rsa'] as const)('opens a %s envelope sealed by Java', async (kind) => {
    const fixture = vectors.envelopes[kind]
    const share = await openShare(fixture.envelope, javaKey(kind), ctx)
    expect(toHex(share)).toBe(fixture.share)
    expect(decodeShare(share).threshold).toBe(2)
  })

  it.each(['x25519', 'rsa'] as const)(
    'computes the same %s fingerprint as the server',
    async (kind) => {
      expect(await fingerprintOf(javaKey(kind).publicKey)).toBe(vectors.envelopes[kind].fingerprint)
    },
  )

  it('reassembles the vault key from Java-made shares', () => {
    const shares = vectors.envelopes.shares.map((s) => decodeShare(fromHex(s)))
    const [first, , third] = shares
    if (!first || !third) throw new Error('fixture incomplete')
    expect(toHex(combine([third, first]))).toBe(vectors.envelopes.vaultKey)
  })
})

describe.each(['X25519', 'RSA-OAEP'] as const)('sealing a share to a %s key', (algorithm) => {
  const secretShare = encodeShare(
    split(utf8Encode('0123456789abcdef0123456789abcdef'), 3, 2)[1] as ReturnType<
      typeof split
    >[number],
  )

  async function keyFor(): Promise<TrusteeKeyMaterial> {
    if (algorithm === 'X25519') return generateTrusteeKeyPair()
    const pair = await crypto.subtle.generateKey(
      {
        name: 'RSA-OAEP',
        modulusLength: 2048,
        publicExponent: new Uint8Array([1, 0, 1]),
        hash: 'SHA-256',
      },
      true,
      ['encrypt', 'decrypt'],
    )
    return {
      algorithm: 'RSA-OAEP',
      publicKey: new Uint8Array(await crypto.subtle.exportKey('spki', pair.publicKey)),
      privateKey: new Uint8Array(await crypto.subtle.exportKey('pkcs8', pair.privateKey)),
    }
  }

  it('round-trips and uses the envelope fields the server validates', async () => {
    const key = await keyFor()
    const sealed = await sealShare(secretShare, key, ctx)
    expect(sealed.alg).toBe(algorithm === 'X25519' ? ALG_X25519 : ALG_RSA)
    expect(Object.keys(sealed).sort()).toEqual(
      algorithm === 'X25519'
        ? ['alg', 'ct', 'epk', 'nonce', 'v']
        : ['alg', 'ct', 'ek', 'nonce', 'v'],
    )
    expect(fromBase64(sealed.nonce)).toHaveLength(12)
    expect(fromBase64(sealed.ct)).toHaveLength(secretShare.length + 16)
    if ('epk' in sealed) expect(fromBase64(sealed.epk)).toHaveLength(32)
    if ('ek' in sealed) expect(fromBase64(sealed.ek)).toHaveLength(256)
    expect(toHex(await openShare({ ...sealed }, key, ctx))).toBe(toHex(secretShare))
  })

  it('does not contain the share in the clear', async () => {
    const sealed = await sealShare(secretShare, await keyFor(), ctx)
    expect(JSON.stringify(sealed)).not.toContain(toBase64(secretShare))
    expect(JSON.stringify(sealed)).not.toContain(toHex(secretShare))
  })

  it('cannot be opened by a different trustee key', async () => {
    const sealed = await sealShare(secretShare, await keyFor(), ctx)
    await expect(openShare({ ...sealed }, await keyFor(), ctx)).rejects.toSatisfy(
      rejectsWith('wrong-key'),
    )
  })

  it.each([
    ['another trustee', { ...ctx, trusteeId: '00000000-0000-0000-0000-000000000000' }],
    ['another vault', { ...ctx, vaultId: '00000000-0000-0000-0000-000000000000' }],
    ['another key version', { ...ctx, vaultVersion: ctx.vaultVersion + 1 }],
  ])('is bound to its place: replay for %s fails', async (_name, otherCtx) => {
    const key = await keyFor()
    const sealed = await sealShare(secretShare, key, ctx)
    await expect(openShare({ ...sealed }, key, otherCtx)).rejects.toSatisfy(
      rejectsWith('wrong-key'),
    )
  })

  it('detects tampering with the ciphertext', async () => {
    const key = await keyFor()
    const sealed: SealedShare = await sealShare(secretShare, key, ctx)
    const ct = fromBase64(sealed.ct)
    ct[3] = (ct[3] ?? 0) ^ 0x40
    await expect(openShare({ ...sealed, ct: toBase64(ct) }, key, ctx)).rejects.toSatisfy(
      rejectsWith('wrong-key'),
    )
  })

  it('rejects a key of the other algorithm with a clear error', async () => {
    const sealed = await sealShare(secretShare, await keyFor(), ctx)
    const otherKind = algorithm === 'X25519' ? javaKey('rsa') : javaKey('x25519')
    await expect(openShare({ ...sealed }, otherKind, ctx)).rejects.toSatisfy(
      rejectsWith('key-mismatch'),
    )
  })
})

describe('envelope handling of malformed input', () => {
  it('reports unsupported algorithms and missing fields', async () => {
    const key = javaKey('x25519')
    await expect(openShare({ v: 1, alg: 'ROT13' }, key, ctx)).rejects.toSatisfy(
      rejectsWith('unsupported'),
    )
    await expect(openShare({ v: 1, alg: ALG_X25519, nonce: 'AAAA' }, key, ctx)).rejects.toSatisfy(
      rejectsWith('bad-format'),
    )
  })

  it('binds the AAD to vault, trustee and version in the server-defined layout', () => {
    expect(utf8Decode(shareAad(ctx))).toBe(
      `digital-legacy/share/v1|${ctx.vaultId}|${ctx.trusteeId}|${ctx.vaultVersion}`,
    )
  })
})

describe('trustee public keys and fingerprints', () => {
  it('generates an X25519 key pair when the platform supports it', async () => {
    const key = await generateTrusteeKeyPair()
    expect(key.algorithm).toBe('X25519')
    expect(key.publicKey).toHaveLength(44)
    expect(await parsePublicKey('X25519', toBase64(key.publicKey))).toEqual(key.publicKey)
  })

  it('validates what the server returns before the owner seals to it', async () => {
    await expect(parsePublicKey('X25519', 'AAAA')).rejects.toSatisfy(rejectsWith('bad-format'))
    await expect(parsePublicKey('X25519', '***')).rejects.toSatisfy(rejectsWith('bad-format'))
    await expect(parsePublicKey('RSA-OAEP', 'AAAA')).rejects.toSatisfy(rejectsWith('bad-format'))
    await expect(parsePublicKey('DSA', 'AAAA')).rejects.toSatisfy(rejectsWith('unsupported'))
    await expect(parsePublicKey('X25519', toBase64(new Uint8Array(44)))).rejects.toSatisfy(
      rejectsWith('bad-format'),
    )
  })

  it('formats fingerprints for reading aloud', () => {
    const hex = 'a1b2c3d4e5f60718293a4b5c6d7e8f90'
    expect(formatFingerprint(hex)).toBe('a1b2 c3d4 e5f6 0718 293a 4b5c 6d7e 8f90')
    expect(shortFingerprint(hex)).toBe('a1b2 c3d4 e5f6 0718')
  })
})
