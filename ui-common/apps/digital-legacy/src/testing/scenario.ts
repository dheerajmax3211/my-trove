import type { TrusteeApi } from '../api/trusteeApi'
import type { SwitchPolicy } from '../api/types'
import {
  generateTrusteeKeyPair,
  generateVaultKey,
  type Bytes,
  type TrusteeKeyMaterial,
  type VaultDocument,
} from '../crypto'
import { saveVault } from '../features/vault/vaultService'
import { sealAndUploadShares } from '../features/trustees/sealing'
import { registerTrustee } from '../features/trusteePortal/trusteeService'
import { defaultPolicy } from '../lib/policyDefaults'
import type { MockBackend } from '../mock/backend'
import { createHarness } from './harness'

export const SECRET_TITLE = 'Offshore account'
export const SECRET_BODY = 'IBAN CH93 0076 2011 6238 5295 7, passcode swordfish-9917'

export const sampleDocument: VaultDocument = {
  v: 1,
  entries: [
    { id: 'e1', title: SECRET_TITLE, body: SECRET_BODY },
    { id: 'e2', title: 'Letter', body: 'Tell Sam the spare key is in the blue teapot.' },
  ],
}

/** An RSA-2048 trustee key, to prove the second envelope format works end to end. */
export async function generateRsaMaterial(): Promise<TrusteeKeyMaterial> {
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

export interface TrusteeFixture {
  id: string
  label: string
  token: string
  material: TrusteeKeyMaterial
  api: TrusteeApi
}

export interface Scenario {
  h: ReturnType<typeof createHarness>
  vaultKey: Bytes
  vaultId: string
  trustees: TrusteeFixture[]
}

export const testPolicy = (overrides: Partial<SwitchPolicy> = {}): SwitchPolicy => ({
  ...defaultPolicy('owner@example.com'),
  quorum: 2,
  ...overrides,
})

/**
 * The state of the world after an owner has done everything right: vault encrypted and uploaded, three
 * trustees (two X25519, one RSA) invited and registered, shares split 2-of-3 and sealed, policy set,
 * switch armed.
 */
export async function armedScenario(
  options: { arm?: boolean; backend?: MockBackend } = {},
): Promise<Scenario> {
  const h = createHarness(options.backend)
  const vaultKey = generateVaultKey()
  const summary = await saveVault(h.owner, vaultKey, sampleDocument, 'create')
  await h.owner.putPolicy(testPolicy())
  const trustees: TrusteeFixture[] = []
  for (const [i, label] of ['Ada', 'Ben', 'Cleo'].entries()) {
    const invite = await h.owner.invite(label)
    const material = i === 2 ? await generateRsaMaterial() : await generateTrusteeKeyPair()
    const registration = await registerTrustee(h.trusteeApi(null), {
      inviteToken: invite.inviteToken,
      contacts: [{ channel: 'EMAIL', address: `${label.toLowerCase()}@example.com` }],
      material,
    })
    trustees.push({
      id: invite.trusteeId,
      label,
      token: registration.response.accessToken,
      material,
      api: h.trusteeApi(registration.response.accessToken),
    })
  }
  const outcomes = await sealAndUploadShares({
    api: h.owner,
    vaultId: summary.id,
    vaultVersion: summary.vaultVersion,
    vaultKey,
    trustees: await h.owner.listTrustees(),
    threshold: 2,
  })
  if (!outcomes.every((o) => o.ok)) throw new Error('sealing failed in scenario setup')
  if (options.arm !== false) await h.owner.arm()
  return { h, vaultKey, vaultId: summary.id, trustees }
}
