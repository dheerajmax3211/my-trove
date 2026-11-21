import { isApiError, type ApiError } from '@platform/api-client'
import { describe, expect, it } from 'vitest'
import { generateTrusteeKeyPair, generateVaultKey, toBase64 } from '../crypto'
import { registerTrustee } from '../features/trusteePortal/trusteeService'
import { saveVault } from '../features/vault/vaultService'
import { createHarness, DAY_MS } from '../testing/harness'
import { armedScenario, sampleDocument, testPolicy } from '../testing/scenario'

async function failure(promise: Promise<unknown>): Promise<ApiError> {
  const error: unknown = await promise.then(
    () => null,
    (e: unknown) => e,
  )
  if (!isApiError(error)) throw new Error('expected an ApiError')
  return error
}

async function withVault() {
  const h = createHarness()
  const summary = await saveVault(h.owner, generateVaultKey(), sampleDocument, 'create')
  return { h, summary }
}

describe('mock backend: authentication', () => {
  it('rejects the owner API without a bearer token and with a trustee token', async () => {
    const { h } = await withVault()
    const noAuth = await h.backend.fetch('/api/v1/legacy/vault')
    expect(noAuth.status).toBe(401)
    const trusteeAuth = await h.backend.fetch('/api/v1/legacy/vault', {
      headers: { Authorization: 'Trustee abc' },
    })
    expect(trusteeAuth.status).toBe(401)
    const expired = await h.backend.fetch('/api/v1/legacy/vault', {
      headers: { Authorization: 'Bearer stub-token-1-expired' },
    })
    expect(expired.status).toBe(401)
  })

  it('rejects the trustee API with a bearer token or an unknown trustee token, but not accept', async () => {
    const { h } = await withVault()
    const bearer = await h.backend.fetch('/api/v1/legacy/trustee/me', {
      headers: { Authorization: 'Bearer stub-token-1' },
    })
    expect(bearer.status).toBe(401)
    expect((await failure(h.trusteeApi('nope').me())).status).toBe(401)
    expect((await failure(h.trusteeApi(null).me())).status).toBe(401)
    const accept = await h.backend.fetch('/api/v1/legacy/trustee/accept', {
      method: 'POST',
      body: '{}',
    })
    expect(accept.status).toBe(400) // reachable without credentials; body fails validation
  })

  it('answers problem+json with the documented shapes', async () => {
    const { h } = await withVault()
    const res = await h.backend.fetch('/api/v1/legacy/vault/trustees/nope/share', {
      method: 'PUT',
      headers: { Authorization: 'Bearer t' },
      body: JSON.stringify({ sealedShare: {}, vaultVersion: 1 }),
    })
    expect(res.headers.get('content-type')).toContain('application/problem+json')
    expect(await res.json()).toMatchObject({ status: 404, title: 'Not found' })
  })
})

describe('mock backend: vault', () => {
  it('has no vault until one is created, and only one per owner', async () => {
    const h = createHarness()
    expect((await failure(h.owner.getVault())).status).toBe(404)
    expect((await failure(h.owner.getState())).status).toBe(404)
    await saveVault(h.owner, generateVaultKey(), sampleDocument, 'create')
    expect(
      (await failure(saveVault(h.owner, generateVaultKey(), sampleDocument, 'create'))).status,
    ).toBe(409)
  })

  it('validates envelope formats and never echoes submitted values', async () => {
    const { h } = await withVault()
    const bad = await failure(
      h.owner.updateVault({
        ciphertext: 'not base64!',
        metadata: { v: 2, alg: 'ROT13', nonce: 'AAAA', extra: 1 } as never,
        keyRotated: false,
      }),
    )
    expect(bad.status).toBe(400)
    const problems = bad.extensions.problems as string[]
    expect(problems).toEqual(
      expect.arrayContaining([
        'ciphertext is not valid Base64',
        "metadata has an unknown field 'extra'",
        'metadata.alg must be AES-256-GCM',
        'metadata.nonce must decode to 12 bytes',
      ]),
    )
    expect(JSON.stringify(bad.toProblem())).not.toContain('ROT13')
  })

  it('refuses content changes while the switch is not ACTIVE', async () => {
    const s = await armedScenario()
    s.h.backend.advance(8 * DAY_MS)
    const error = await failure(saveVault(s.h.owner, s.vaultKey, sampleDocument, 'update'))
    expect(error.status).toBe(409)
    expect(error.message).toMatch(/only be changed while the switch is ACTIVE; check in first/)
  })
})

describe('mock backend: policy and arming', () => {
  it('lists every policy problem in one 400', async () => {
    const { h } = await withVault()
    const error = await failure(
      h.owner.putPolicy(
        testPolicy({
          checkInIntervalSeconds: 60,
          graceSeconds: 100 * 86400,
          coolOffSeconds: 10,
          maxPauseSeconds: 90 * 86400,
          escalationDurationSeconds: 100,
          steps: [
            { offsetSeconds: 500, urgency: 'FINAL', audience: 'ALL', channels: ['EMAIL', 'EMAIL'] },
            { offsetSeconds: 500, urgency: 'NOTICE', audience: 'OWNER', channels: ['SMS'] },
          ],
          ownerContacts: [
            { channel: 'EMAIL', address: 'nope' },
            { channel: 'SMS', address: '12345' },
          ],
        }),
      ),
    )
    expect(error.status).toBe(400)
    const text = (error.extensions.problems as string[]).join('\n')
    for (const fragment of [
      'checkInIntervalSeconds must be between 3600',
      'graceSeconds must be between 0',
      'coolOffSeconds must be between 3600',
      'maxPauseSeconds exceeds',
      'steps[1].offsetSeconds must be strictly greater',
      'steps[1].urgency must not be lower',
      'steps[0].channels must not repeat',
      'escalationDurationSeconds must be at least',
      'ownerContacts[0] has an invalid EMAIL address',
      'ownerContacts[1] has an invalid SMS address',
    ])
      expect(text).toContain(fragment)
  })

  it('will not arm without a policy or enough shareholders, and says exactly why', async () => {
    const { h } = await withVault()
    expect((await failure(h.owner.arm())).message).toMatch(/no check-in policy set/)
    await h.owner.putPolicy(testPolicy())
    const state = await h.owner.getState()
    expect(state.readiness.problems).toEqual([
      'only 0 trustee(s) hold a share of the current key but the quorum is 2',
    ])
  })

  it('refuses a quorum larger than the number of trustees', async () => {
    const { h } = await withVault()
    await h.owner.invite('Only one')
    const error = await failure(h.owner.putPolicy(testPolicy({ quorum: 2 })))
    expect(error.status).toBe(409)
    expect(error.message).toBe('quorum 2 exceeds the number of trustees (1)')
  })

  it('restarts the interval when an armed policy changes, like a check-in', async () => {
    const s = await armedScenario()
    s.h.backend.advance(3 * DAY_MS)
    const before = await s.h.owner.getState()
    const after = await s.h.owner.putPolicy({
      ...before.policy!,
      checkInIntervalSeconds: 14 * 86400,
    })
    expect(new Date(after.nextDueAt!).getTime()).toBeGreaterThan(
      new Date(before.nextDueAt!).getTime(),
    )
  })
})

describe('mock backend: trustees', () => {
  it('burns the invite on first use and rejects bad contacts and keys', async () => {
    const { h } = await withVault()
    const invite = await h.owner.invite('Ada')
    const material = await generateTrusteeKeyPair()
    const contacts = [{ channel: 'EMAIL' as const, address: 'ada@example.com' }]
    const api = h.trusteeApi(null)
    expect(
      (
        await failure(
          registerTrustee(api, {
            inviteToken: invite.inviteToken,
            contacts: [{ channel: 'SMS', address: 'x' }],
            material,
          }),
        )
      ).status,
    ).toBe(400)
    expect(
      (
        await failure(
          api.accept({
            inviteToken: invite.inviteToken,
            keyAlgorithm: 'X25519',
            publicKey: toBase64(new Uint8Array(44)),
            contacts,
          }),
        )
      ).status,
    ).toBe(400)
    const ok = await registerTrustee(api, { inviteToken: invite.inviteToken, contacts, material })
    expect(ok.fingerprintMatches).toBe(true)
    expect(ok.response.scheme).toBe('Trustee')
    expect(
      (await failure(registerTrustee(api, { inviteToken: invite.inviteToken, contacts, material })))
        .status,
    ).toBe(404)
  })

  it('expires invites after 14 days', async () => {
    const { h } = await withVault()
    const invite = await h.owner.invite('Late')
    h.backend.advance(15 * DAY_MS)
    const error = await failure(
      registerTrustee(h.trusteeApi(null), {
        inviteToken: invite.inviteToken,
        contacts: [{ channel: 'EMAIL', address: 'late@example.com' }],
        material: await generateTrusteeKeyPair(),
      }),
    )
    expect(error.status).toBe(404)
    expect(error.message).toMatch(/invalid, expired or already used/)
  })

  it('allows at most ten trustees', async () => {
    const { h } = await withVault()
    for (let i = 0; i < 10; i++) await h.owner.invite(`T${i}`)
    expect((await failure(h.owner.invite('one too many'))).status).toBe(409)
  })

  it('rejects malformed sealed shares and stale key versions', async () => {
    const s = await armedScenario({ arm: false })
    const [ada] = s.trustees
    if (!ada) throw new Error('fixture')
    const view = (await s.h.owner.listTrustees())[0]
    expect(view?.shareCurrent).toBe(true)
    const wrongVersion = await failure(
      s.h.owner.uploadShare(ada.id, { sealedShare: {}, vaultVersion: 7 }),
    )
    expect(wrongVersion.status).toBe(409)
    const malformed = await failure(
      s.h.owner.uploadShare(ada.id, {
        sealedShare: {
          v: 1,
          alg: 'RSA-OAEP-SHA256-AES256GCM',
          ek: 'AAAA',
          nonce: 'AAAA',
          ct: 'AAAA',
          junk: 1,
        },
        vaultVersion: 1,
      }),
    )
    expect(malformed.status).toBe(400)
    expect((malformed.extensions.problems as string[]).join()).toContain(
      'must be X25519-HKDF-SHA256-AES256GCM',
    )
  })

  it('refuses to revoke below the quorum while armed, and revoking is idempotent otherwise', async () => {
    const s = await armedScenario()
    const [ada, ben] = s.trustees
    if (!ada || !ben) throw new Error('fixture')
    await s.h.owner.revokeTrustee(ada.id) // two holders remain: still the quorum
    expect((await failure(s.h.owner.revokeTrustee(ben.id))).message).toMatch(
      /fewer share holders than the quorum/,
    )
    await s.h.owner.disarm()
    await s.h.owner.revokeTrustee(ben.id)
    await s.h.owner.revokeTrustee(ben.id)
    expect((await s.h.owner.listTrustees()).map((t) => t.status).slice(0, 2)).toEqual([
      'REVOKED',
      'REVOKED',
    ])
    expect((await failure(ada.api.me())).status).toBe(401)
  })

  it('confirms a share only with the matching digest', async () => {
    const s = await armedScenario({ arm: false })
    const ada = s.trustees[0]!
    const me = await ada.api.me()
    expect(me.shareUploaded).toBe(true)
    expect((await failure(ada.api.confirmShare('00'.repeat(32)))).status).toBe(409)
    const confirmed = await ada.api.confirmShare(me.shareDigest ?? '')
    expect(confirmed.status).toBe('CONFIRMED')
    expect((await s.h.owner.listTrustees())[0]?.shareConfirmed).toBe(true)
  })
})

describe('mock backend: voting and retrieval gates', () => {
  it('only lets trustees vote in RELEASE_PENDING and fetch only once RELEASED', async () => {
    const s = await armedScenario()
    const ada = s.trustees[0]!
    expect((await failure(ada.api.vote('APPROVE'))).message).toBe('Voting is not open')
    expect((await failure(ada.api.getShare())).message).toBe('The vault has not been released')
    expect((await failure(ada.api.getCiphertext())).status).toBe(409)
    expect((await ada.api.me()).phase).toBe('WAITING')
    s.h.backend.advance(17 * DAY_MS + 3600_000)
    expect((await ada.api.me()).phase).toBe('VOTING')
    const vote = await ada.api.vote('APPROVE')
    expect(vote).toMatchObject({ decision: 'APPROVE', phase: 'VOTING', changed: true })
    expect((await ada.api.vote('APPROVE')).changed).toBe(false)
    expect((await ada.api.me()).myDecision).toBe('APPROVE')
  })

  it('does not let a trustee without a current share vote', async () => {
    const s = await armedScenario({ arm: false })
    const extra = await s.h.owner.invite('Dan')
    const material = await generateTrusteeKeyPair()
    const reg = await registerTrustee(s.h.trusteeApi(null), {
      inviteToken: extra.inviteToken,
      contacts: [{ channel: 'EMAIL', address: 'dan@example.com' }],
      material,
    })
    await s.h.owner.arm()
    s.h.backend.advance(17 * DAY_MS + 3600_000)
    const error = await failure(s.h.trusteeApi(reg.response.accessToken).vote('APPROVE'))
    expect(error.message).toMatch(/do not hold a share/)
  })
})

describe('mock backend: audit trail', () => {
  it('records the story newest first and the chain verifies', async () => {
    const s = await armedScenario()
    const events = await s.h.owner.timeline()
    expect(events[0]?.eventType).toBe('ARMED')
    expect(events.map((e) => e.eventType)).toContain('VAULT_CREATED')
    expect(events.filter((e) => e.eventType === 'SHARE_UPLOADED')).toHaveLength(3)
    expect(events.every((e, i) => i === 0 || e.seq < (events[i - 1]?.seq ?? 0))).toBe(true)
    const chain = await s.h.owner.verifyAudit()
    expect(chain).toMatchObject({ intact: true, firstBadSeq: null })
    expect(chain.headHash).toMatch(/^[0-9a-f]{64}$/)
    expect(chain.length).toBe(events.length)
    expect((await s.h.owner.timeline(2)).length).toBe(2)
  })

  it('reports where the chain breaks after history is edited behind its back', async () => {
    const s = await armedScenario()
    s.h.backend.tamperWithAudit(3)
    expect(await s.h.owner.verifyAudit()).toMatchObject({
      intact: false,
      firstBadSeq: 3,
      headHash: null,
    })
  })
})
