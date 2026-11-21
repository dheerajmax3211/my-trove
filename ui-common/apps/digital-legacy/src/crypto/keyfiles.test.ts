import { describe, expect, it } from 'vitest'
import { fromBase64, toBase64, toHex } from './bytes'
import { isCryptoError } from './errors'
import {
  createTrusteeKeyFile,
  fingerprintOf,
  generateTrusteeKeyPair,
  openTrusteeKeyFile,
  parseTrusteeKeyFile,
  serializeTrusteeKeyFile,
  trusteeKeyFileNeedsPassphrase,
} from './trusteeKeys'
import {
  createVaultKeyFile,
  openVaultKeyFile,
  parseVaultKeyFile,
  serializeVaultKeyFile,
} from './vaultKeyFile'
import { generateVaultKey } from './vaultCrypto'

const FAST = 100_000 // the minimum the opener accepts; production uses 600k
const PASS = 'a long enough passphrase'
const rejectsWith = (code: Parameters<typeof isCryptoError>[1]) => (e: unknown) =>
  isCryptoError(e, code)

describe('vault key file', () => {
  it('round-trips the key through a passphrase-protected file', async () => {
    const key = generateVaultKey()
    const text = serializeVaultKeyFile(await createVaultKeyFile(key, PASS, FAST))
    expect(text).not.toContain(toBase64(key))
    expect(text).not.toContain(toHex(key))
    expect(toHex(await openVaultKeyFile(parseVaultKeyFile(text), PASS))).toBe(toHex(key))
  })

  it('rejects a wrong passphrase with a clear error', async () => {
    const file = await createVaultKeyFile(generateVaultKey(), PASS, FAST)
    await expect(openVaultKeyFile(file, 'another long passphrase')).rejects.toSatisfy(
      rejectsWith('wrong-passphrase'),
    )
  })

  it('enforces a minimum passphrase length when creating the file', async () => {
    await expect(createVaultKeyFile(generateVaultKey(), 'short', FAST)).rejects.toThrow(
      /at least 12/,
    )
  })

  it('rejects files that are not vault key files, or that were tampered with', async () => {
    expect(() => parseVaultKeyFile('nonsense')).toThrow(/not a vault key file/)
    expect(() => parseVaultKeyFile('{"format":"other","v":1}')).toThrow(/not a vault key file/)
    const file = await createVaultKeyFile(generateVaultKey(), PASS, FAST)
    const raw = fromBase64(file.protected.ciphertext)
    raw[0] = (raw[0] ?? 0) ^ 1
    await expect(
      openVaultKeyFile(
        { ...file, protected: { ...file.protected, ciphertext: toBase64(raw) } },
        PASS,
      ),
    ).rejects.toSatisfy(rejectsWith('wrong-passphrase'))
  })

  it('refuses key-derivation settings that are absurdly weak or expensive', async () => {
    const file = await createVaultKeyFile(generateVaultKey(), PASS, FAST)
    for (const iterations of [1, 50_000_000]) {
      await expect(
        openVaultKeyFile(
          { ...file, protected: { ...file.protected, kdf: { ...file.protected.kdf, iterations } } },
          PASS,
        ),
      ).rejects.toSatisfy(rejectsWith('unsupported'))
    }
  })
})

describe('trustee key file', () => {
  it('stores the private key unprotected only when the trustee chooses no passphrase', async () => {
    const material = await generateTrusteeKeyPair()
    const file = await createTrusteeKeyFile(material, null)
    expect(file.privateKey.protection).toBe('none')
    expect(trusteeKeyFileNeedsPassphrase(file)).toBe(false)
    const opened = await openTrusteeKeyFile(
      parseTrusteeKeyFile(serializeTrusteeKeyFile(file)),
      null,
    )
    expect(opened.algorithm).toBe('X25519')
    expect(toHex(opened.privateKey)).toBe(toHex(material.privateKey))
    expect(file.fingerprint).toBe(await fingerprintOf(material.publicKey))
  })

  it('protects the private key with a passphrase when asked', async () => {
    const material = await generateTrusteeKeyPair()
    const file = await createTrusteeKeyFile(material, 'correct horse battery', FAST)
    expect(trusteeKeyFileNeedsPassphrase(file)).toBe(true)
    expect(serializeTrusteeKeyFile(file)).not.toContain(toBase64(material.privateKey))
    await expect(openTrusteeKeyFile(file, null)).rejects.toSatisfy(rejectsWith('wrong-passphrase'))
    await expect(openTrusteeKeyFile(file, 'wrong passphrase!')).rejects.toSatisfy(
      rejectsWith('wrong-passphrase'),
    )
    expect(toHex((await openTrusteeKeyFile(file, 'correct horse battery')).privateKey)).toBe(
      toHex(material.privateKey),
    )
  })

  it('detects a public key that does not match the fingerprint in the file', async () => {
    const material = await generateTrusteeKeyPair()
    const other = await generateTrusteeKeyPair()
    const file = await createTrusteeKeyFile(material, null)
    await expect(
      openTrusteeKeyFile({ ...file, publicKey: toBase64(other.publicKey) }, null),
    ).rejects.toSatisfy(rejectsWith('bad-format'))
  })

  it('rejects files that are not trustee key files', async () => {
    expect(() => parseTrusteeKeyFile('{')).toThrow(/not a trustee key file/)
    expect(() => parseTrusteeKeyFile('{"format":"digital-legacy-trustee-key","v":1}')).toThrow(
      /not a trustee key file/,
    )
    const vaultFile = await createVaultKeyFile(generateVaultKey(), PASS, FAST)
    expect(() => parseTrusteeKeyFile(serializeVaultKeyFile(vaultFile))).toThrow(
      /not a trustee key file/,
    )
  })
})
