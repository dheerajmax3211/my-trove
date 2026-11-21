import { isApiError } from '@platform/api-client'
import { describe, expect, it } from 'vitest'
import {
  combine,
  encodeShare,
  fromBase64,
  isCryptoError,
  toBase64,
  toHex,
  type Share,
} from './crypto'
import { retrieveShare, decryptReleasedVault } from './features/trusteePortal/trusteeService'
import { openVault, saveVault } from './features/vault/vaultService'
import { DAY_MS } from './testing/harness'
import {
  armedScenario,
  generateRsaMaterial,
  sampleDocument,
  SECRET_BODY,
  SECRET_TITLE,
  type Scenario,
} from './testing/scenario'

async function expectApiError(promise: Promise<unknown>, status: number, detail?: RegExp) {
  const error: unknown = await promise.then(
    () => null,
    (e: unknown) => e,
  )
  expect(isApiError(error)).toBe(true)
  if (!isApiError(error)) return
  expect(error.status).toBe(status)
  if (detail) expect(error.message).toMatch(detail)
}

/** Silence: interval + grace + escalation, then the trustees are asked. */
async function reachReleasePending(s: Scenario) {
  s.h.backend.advance(7 * DAY_MS + 3 * DAY_MS + 7 * DAY_MS + 60_000)
  expect((await s.h.owner.getState()).state).toBe('RELEASE_PENDING')
}

async function release(s: Scenario) {
  await reachReleasePending(s)
  const [ada, ben] = s.trustees
  expect((await ada?.api.vote('APPROVE'))?.phase).toBe('VOTING')
  await ben?.api.vote('APPROVE')
  expect((await s.h.owner.getState()).quorum.quorumReachedAt).not.toBeNull()
  s.h.backend.advance(3 * DAY_MS + 60_000)
  expect((await s.h.owner.getState()).state).toBe('RELEASED')
}

describe('end to end: encrypt, seal, silence, approve, release, combine', () => {
  it('recovers the original plaintext from two of three trustees, and not from one', async () => {
    const s = await armedScenario()
    expect((await s.h.owner.getState()).readiness).toEqual({ armable: true, problems: [] })
    await release(s)

    const [ada, ben, cleo] = s.trustees
    if (!ada || !ben || !cleo) throw new Error('fixture')
    const adaShare = await retrieveShare(ada.api, ada.material)
    const cleoShare = await retrieveShare(cleo.api, cleo.material) // the RSA trustee
    const ciphertext = await ada.api.getCiphertext()

    // one share cannot decrypt (and is refused outright)
    expect(() => combine([adaShare.share])).toThrow(/need 2 shares/)

    const doc = await decryptReleasedVault([adaShare.share, cleoShare.share], ciphertext)
    expect(doc).toEqual(sampleDocument)
    expect(doc.entries[0]?.body).toBe(SECRET_BODY)

    // any pair works
    const benShare = await retrieveShare(ben.api, ben.material)
    expect(await decryptReleasedVault([benShare.share, adaShare.share], ciphertext)).toEqual(
      sampleDocument,
    )
  })

  it('rejects mismatched shares: a share from another split cannot be mixed in', async () => {
    const s = await armedScenario()
    await release(s)
    const [ada] = s.trustees
    if (!ada) throw new Error('fixture')
    const mine = await retrieveShare(ada.api, ada.material)
    const other = await armedScenario()
    await release(other)
    const [foreign] = other.trustees
    if (!foreign) throw new Error('fixture')
    const theirs = await retrieveShare(foreign.api, foreign.material)
    await expect(
      decryptReleasedVault([mine.share, theirs.share], await ada.api.getCiphertext()),
    ).rejects.toThrow(/different splits|duplicate/)
  })

  it('the owner can still read their vault back, and edits keep the same shares valid', async () => {
    const s = await armedScenario({ arm: false })
    expect(await openVault(s.h.owner, s.vaultKey)).toEqual(sampleDocument)
    const edited = {
      v: 1 as const,
      entries: [...sampleDocument.entries, { id: 'e3', title: 'New', body: 'later' }],
    }
    const summary = await saveVault(s.h.owner, s.vaultKey, edited, 'update')
    expect(summary.contentRevision).toBe(2)
    expect(summary.vaultVersion).toBe(1)
    expect(await openVault(s.h.owner, s.vaultKey)).toEqual(edited)
    expect((await s.h.owner.listTrustees()).every((t) => t.shareCurrent)).toBe(true)
  })

  it('rotating the key wipes every share, disarms and bumps the key version', async () => {
    const s = await armedScenario()
    const newKey = crypto.getRandomValues(new Uint8Array(32))
    const summary = await saveVault(s.h.owner, newKey, sampleDocument, 'rotate')
    expect(summary.vaultVersion).toBe(2)
    const state = await s.h.owner.getState()
    expect(state.armed).toBe(false)
    expect(state.readiness.armable).toBe(false)
    expect((await s.h.owner.listTrustees()).some((t) => t.shareUploaded)).toBe(false)
    await expectApiError(s.h.owner.arm(), 409, /Not ready to arm/)
  })
})

describe('owner check-in', () => {
  it.each([
    ['GRACE', 7 * DAY_MS + 1000],
    ['ESCALATING', 10 * DAY_MS + 1000],
    ['RELEASE_PENDING', 17 * DAY_MS + 60_000],
  ])('returns the switch from %s to ACTIVE and voids earlier approvals', async (expected, ms) => {
    const s = await armedScenario()
    s.h.backend.advance(ms)
    const before = await s.h.owner.getState()
    expect(before.state).toBe(expected)
    if (expected === 'RELEASE_PENDING') await s.trustees[0]?.api.vote('APPROVE')
    const after = await s.h.owner.checkIn()
    expect(after.state).toBe('ACTIVE')
    expect(after.escalation.stepsExecuted).toBe(0)
    expect(after.quorum.quorumReachedAt).toBeNull()
    expect(after.quorum.approved).toBe(0)
    expect(new Date(after.nextDueAt ?? 0).getTime()).toBeGreaterThan(s.h.backend.now())
  })

  it('cancels a release during the cool-off', async () => {
    const s = await armedScenario()
    await reachReleasePending(s)
    await s.trustees[0]?.api.vote('APPROVE')
    await s.trustees[1]?.api.vote('APPROVE')
    s.h.backend.advance(DAY_MS)
    expect((await s.h.owner.checkIn()).state).toBe('ACTIVE')
    s.h.backend.advance(5 * DAY_MS)
    expect((await s.h.owner.getState()).state).toBe('ACTIVE')
    await expectApiError(
      s.trustees[0]?.api.getShare() ?? Promise.reject(new Error('x')),
      409,
      /not been released/,
    )
  })

  it('is refused once the vault has been released', async () => {
    const s = await armedScenario()
    await release(s)
    await expectApiError(s.h.owner.checkIn(), 409, /already been released/)
    await expectApiError(s.h.owner.disarm(), 409, /already been released/)
  })

  it('release needs the quorum and the full cool-off: one approval is not enough', async () => {
    const s = await armedScenario()
    await reachReleasePending(s)
    await s.trustees[0]?.api.vote('APPROVE')
    s.h.backend.advance(30 * DAY_MS)
    expect((await s.h.owner.getState()).state).toBe('RELEASE_PENDING')
    await s.trustees[1]?.api.vote('DECLINE')
    s.h.backend.advance(30 * DAY_MS)
    expect((await s.h.owner.getState()).state).toBe('RELEASE_PENDING')
    // a changed vote reaches the quorum; the cool-off then has to run in full
    await s.trustees[1]?.api.vote('APPROVE')
    s.h.backend.advance(2 * DAY_MS)
    expect((await s.h.owner.getState()).state).toBe('RELEASE_PENDING')
    s.h.backend.advance(2 * DAY_MS)
    expect((await s.h.owner.getState()).state).toBe('RELEASED')
  })
})

describe('what the server is allowed to see', () => {
  it('no request ever contains plaintext, the vault key, a share or a trustee private key', async () => {
    const s = await armedScenario()
    await release(s)
    const shares: Share[] = []
    const shareBytes: Uint8Array[] = []
    for (const t of s.trustees.slice(0, 2)) {
      const { share } = await retrieveShare(t.api, t.material)
      shares.push(share)
      shareBytes.push(encodeShare(share), share.y)
    }
    await decryptReleasedVault(shares, await s.trustees[0]!.api.getCiphertext())
    await saveVault(s.h.owner, s.vaultKey, sampleDocument, 'update').catch(() => undefined)

    const forbidden: string[] = [SECRET_BODY, SECRET_TITLE, 'swordfish', 'blue teapot', 'IBAN']
    const binary = [s.vaultKey, ...shareBytes, ...s.trustees.map((t) => t.material.privateKey)]
    for (const bytes of binary) {
      const b64 = toBase64(bytes)
      forbidden.push(
        b64,
        toHex(bytes),
        b64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''),
      )
    }

    const requests = s.h.backend.requests
    expect(requests.length).toBeGreaterThan(20)
    for (const r of requests) {
      const haystack = `${r.path}\n${r.body ?? ''}`
      for (const needle of forbidden) expect(haystack).not.toContain(needle)
    }
  })

  it('bodies carry only ciphertext, sealed envelopes and public keys, with the documented fields', async () => {
    const s = await armedScenario()
    const bodies = (method: string, path: RegExp) =>
      s.h.backend.requests
        .filter((r) => r.method === method && path.test(r.path))
        .map((r) => JSON.parse(r.body ?? '{}') as Record<string, unknown>)

    for (const body of bodies('POST', /^\/v1\/legacy\/vault$/)) {
      expect(Object.keys(body).sort()).toEqual(['ciphertext', 'metadata'])
      expect(Object.keys(body.metadata as object).sort()).toEqual(['alg', 'nonce', 'v'])
      expect(fromBase64(body.ciphertext as string).length).toBeGreaterThan(16)
    }
    const uploads = bodies('PUT', /\/share$/)
    expect(uploads).toHaveLength(3)
    for (const body of uploads) {
      expect(Object.keys(body).sort()).toEqual(['sealedShare', 'vaultVersion'])
      const envelope = body.sealedShare as Record<string, unknown>
      expect(['X25519-HKDF-SHA256-AES256GCM', 'RSA-OAEP-SHA256-AES256GCM']).toContain(envelope.alg)
    }
    const accepts = bodies('POST', /\/trustee\/accept$/)
    expect(accepts).toHaveLength(3)
    for (const body of accepts)
      expect(Object.keys(body).sort()).toEqual([
        'contacts',
        'inviteToken',
        'keyAlgorithm',
        'publicKey',
      ])
  })

  it('uses the right scheme on every request: Bearer for the owner, Trustee for trustees', async () => {
    const s = await armedScenario()
    await s.trustees[0]?.api.me()
    for (const r of s.h.backend.requests) {
      if (r.path.startsWith('/v1/legacy/trustee/accept')) expect(r.authorization).toBeNull()
      else if (r.path.startsWith('/v1/legacy/trustee'))
        expect(r.authorization).toMatch(/^Trustee \S+$/)
      else expect(r.authorization).toBe('Bearer stub-token-1')
    }
  })
})

describe('wrong key files fail clearly', () => {
  it("another trustee's key cannot open my share, and the message says why", async () => {
    const s = await armedScenario()
    await release(s)
    const [ada, ben] = s.trustees
    if (!ada || !ben) throw new Error('fixture')
    const error: unknown = await retrieveShare(ada.api, ben.material).catch((e: unknown) => e)
    expect(isCryptoError(error, 'key-mismatch')).toBe(true)
    expect(String(error)).toMatch(/does not belong to your registration/)
  })

  it("a stranger's key of the same type is rejected before any decryption is attempted", async () => {
    const s = await armedScenario()
    await release(s)
    const ada = s.trustees[0]
    if (!ada) throw new Error('fixture')
    const stranger = await generateRsaMaterial()
    await expect(retrieveShare(ada.api, stranger)).rejects.toSatisfy((e) =>
      isCryptoError(e, 'key-mismatch'),
    )
  })

  it('shares that combine but do not belong to this vault give a precise decryption error', async () => {
    const s = await armedScenario()
    await release(s)
    const other = await armedScenario()
    await release(other)
    const mine = await Promise.all(
      s.trustees.slice(0, 2).map((t) => retrieveShare(t.api, t.material)),
    )
    const ciphertextOfOther = await other.trustees[0]!.api.getCiphertext()
    await expect(
      decryptReleasedVault(
        mine.map((m) => m.share),
        ciphertextOfOther,
      ),
    ).rejects.toThrow(/do not open the vault|does not open the vault/)
  })
})

describe('vacation pause limits', () => {
  it('refuses a pause longer than the owner policy allows, and a second while paused', async () => {
    const s = await armedScenario()
    const max = (await s.h.owner.getState()).pause.maxSingleSeconds
    expect(max).toBe(30 * 86400)
    await expectApiError(s.h.owner.pause(max + 1), 409, /exceeds the maximum of 30d/)
    const paused = await s.h.owner.pause(10 * 86400)
    expect(paused.pausedUntil).not.toBeNull()
    expect(paused.pause.usedSeconds).toBe(10 * 86400)
    await expectApiError(s.h.owner.pause(86400), 409, /already paused/)
  })

  it('resuming refunds the unused part; a check-in does too', async () => {
    const s = await armedScenario()
    await s.h.owner.pause(20 * 86400)
    s.h.backend.advance(5 * DAY_MS)
    const resumed = await s.h.owner.resume()
    expect(resumed.pausedUntil).toBeNull()
    expect(resumed.pause.usedSeconds).toBeGreaterThanOrEqual(5 * 86400 - 5)
    expect(resumed.pause.usedSeconds).toBeLessThan(5 * 86400 + 5)
    await s.h.owner.pause(10 * 86400)
    expect((await s.h.owner.checkIn()).pause.usedSeconds).toBeLessThan(5 * 86400 + 10)
  })

  it('stops the switch from firing while paused, and enforces the yearly budget', async () => {
    const s = await armedScenario()
    await s.h.owner.putPolicy({
      ...(await s.h.owner.getState()).policy!,
      maxPauseSeconds: 60 * 86400,
    })
    await s.h.owner.pause(60 * 86400)
    s.h.backend.advance(30 * DAY_MS)
    expect((await s.h.owner.getState()).state).toBe('ACTIVE')
    s.h.backend.advance(31 * DAY_MS) // pause over; the next check-in is a full interval away
    const after = await s.h.owner.getState()
    expect(after.state).toBe('ACTIVE')
    expect(after.pausedUntil).toBeNull()
    await s.h.owner.pause(60 * 86400)
    s.h.backend.advance(61 * DAY_MS)
    await expectApiError(s.h.owner.pause(86400), 409, /yearly vacation budget of 120 days/)
  })

  it('refuses to pause a disarmed or overdue switch', async () => {
    const s = await armedScenario({ arm: false })
    await expectApiError(s.h.owner.pause(86400), 409, /not armed/)
    await s.h.owner.arm()
    s.h.backend.advance(8 * DAY_MS)
    await expectApiError(s.h.owner.pause(86400), 409, /only possible while the switch is ACTIVE/)
  })
})
