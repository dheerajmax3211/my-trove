import { screen, waitFor, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import {
  createVaultKeyFile,
  fingerprintOf,
  generateTrusteeKeyPair,
  serializeVaultKeyFile,
} from '../../crypto'
import { MockBackend } from '../../mock/backend'
import { registerTrustee } from '../trusteePortal/trusteeService'
import { saveVault } from '../vault/vaultService'
import { createHarness, urlOf } from '../../testing/harness'
import { generateVaultKey } from '../../crypto'
import { renderApp, setupBrowserStubs, type Rendered } from '../../testing/render'
import { armedScenario, sampleDocument, testPolicy } from '../../testing/scenario'
import { describeQuorum } from './quorumAdvice'
import { inviteLink } from './InviteDialog'

setupBrowserStubs()
const PASSPHRASE = 'correct horse battery staple'
const SLOW = { timeout: 8000 }

/** A vault with a policy and three registered trustees, but no shares sealed yet. */
async function unsealedScenario() {
  const backend = new MockBackend()
  const h = createHarness(backend)
  const vaultKey = generateVaultKey()
  await saveVault(h.owner, vaultKey, sampleDocument, 'create')
  await h.owner.putPolicy(testPolicy({ quorum: 2 }))
  const keys = []
  for (const label of ['Ada', 'Ben', 'Cleo']) {
    const invite = await h.owner.invite(label)
    const material = await generateTrusteeKeyPair()
    await registerTrustee(h.trusteeApi(null), {
      inviteToken: invite.inviteToken,
      contacts: [{ channel: 'EMAIL', address: `${label.toLowerCase()}@example.com` }],
      material,
    })
    keys.push({ label, fingerprint: await fingerprintOf(material.publicKey) })
  }
  const keyFile = serializeVaultKeyFile(await createVaultKeyFile(vaultKey, PASSPHRASE, 100_000))
  return { backend, h, keys, keyFile }
}

async function unlockThroughUi(r: Rendered, keyFile: string) {
  await r.user.click(await screen.findByRole('link', { name: 'Vault' }))
  await r.user.click(await screen.findByLabelText(/Vault key file: or paste/))
  await r.user.paste(keyFile)
  await r.user.type(screen.getByLabelText(/^Passphrase/), PASSPHRASE)
  await r.user.click(screen.getByRole('button', { name: 'Unlock vault' }))
  await screen.findByRole('button', { name: 'Lock vault' }, SLOW)
  await r.user.click(screen.getByRole('link', { name: 'Trustees' }))
}

describe('quorum advice', () => {
  it('spells out the consequences of t of n', () => {
    expect(describeQuorum(2, 3).join(' ')).toMatch(
      /Any 2 of your 3 trustees.*Up to 1 trustee can lose their key/,
    )
    expect(describeQuorum(3, 3).join(' ')).toMatch(/no margin/)
    expect(describeQuorum(1, 3).join(' ')).toMatch(
      /single trustee can open everything on their own/,
    )
    expect(describeQuorum(1, 1).join(' ')).toMatch(/no margin/)
    expect(describeQuorum(1, 0)).toEqual(['Invite at least one trustee first.'])
  })

  it('builds invite links with the token after the # so it is never sent to a server', () => {
    expect(inviteLink('https://app.example', 'abc')).toBe(
      'https://app.example/trustee/accept#invite=abc',
    )
  })
})

describe('trustees page', () => {
  it('asks for a vault first when there is none', async () => {
    renderApp('/trustees')
    expect(
      await screen.findByRole('heading', { name: 'Create your vault first' }),
    ).toBeInTheDocument()
  })

  it('invites a trustee and shows the link exactly once', async () => {
    const s = await unsealedScenario()
    const r = renderApp('/trustees', { mock: s.backend })
    await r.user.click(await screen.findByRole('button', { name: 'Invite a trustee' }))
    const dialog = await screen.findByRole('dialog', { name: 'Invite a trustee' })
    await r.user.click(within(dialog).getByRole('button', { name: 'Create invite' }))
    expect(await within(dialog).findByText('Enter a name.')).toBeInTheDocument()
    await r.user.type(within(dialog).getByLabelText(/^Their name/), 'Dana')
    await r.user.click(within(dialog).getByRole('button', { name: 'Create invite' }))
    const done = await screen.findByRole('dialog', { name: 'Invite for Dana' })
    const link = within(done).getByLabelText<HTMLInputElement>('Invite link').value
    expect(link).toMatch(/\/trustee\/accept#invite=[\w-]{40,}$/)
    expect(within(done).getByText(/shown only this once/)).toBeInTheDocument()
    await r.user.click(within(done).getByRole('button', { name: 'Done' }))
    expect(await screen.findByRole('listitem', { name: 'Dana' })).toHaveTextContent(
      'Invited, no key yet',
    )
    expect(screen.queryByDisplayValue(link)).not.toBeInTheDocument()
    // the server only ever stored a digest: the link is not in any later response
    const later = await s.h.owner.listTrustees()
    expect(JSON.stringify(later)).not.toContain(link.split('=')[1])
  })

  it('shows registered keys and blocks sealing until the fingerprint is compared', async () => {
    const s = await unsealedScenario()
    const r = renderApp('/trustees', { mock: s.backend })
    expect(await screen.findByRole('listitem', { name: 'Ada' })).toHaveTextContent('Key registered')
    expect(screen.getAllByText('Fingerprint not verified')).toHaveLength(3)
    expect(screen.getByText(/Unlock your vault key first/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Seal and upload shares' })).toBeDisabled()

    await r.user.click(
      within(screen.getByRole('listitem', { name: 'Ada' })).getByRole('button', {
        name: 'Compare fingerprint',
      }),
    )
    const dialog = await screen.findByRole('dialog', { name: "Compare Ada's key fingerprint" })
    const shown = within(dialog)
      .getByLabelText('Ada key fingerprint')
      .textContent?.replace(/\s/g, '')
    expect(shown).toBe(s.keys[0]?.fingerprint)
    expect(within(dialog).getByText(/hand you its own key/)).toBeInTheDocument()
    await r.user.click(within(dialog).getByRole('checkbox'))
    await r.user.click(within(dialog).getByRole('button', { name: 'Done' }))
    expect(
      within(screen.getByRole('listitem', { name: 'Ada' })).getByText('Fingerprint verified'),
    ).toBeInTheDocument()
    expect(JSON.parse(localStorage.getItem('dl.verified-fingerprints') ?? '[]')).toEqual([
      s.keys[0]?.fingerprint,
    ])
  })

  it('seals shares to every trustee in the browser and uploads only sealed envelopes', async () => {
    const s = await unsealedScenario()
    const r = renderApp('/', { mock: s.backend })
    await unlockThroughUi(r, s.keyFile)
    await screen.findByRole('listitem', { name: 'Ada' })
    for (const name of ['Ada', 'Ben', 'Cleo']) {
      await r.user.click(
        within(screen.getByRole('listitem', { name })).getByRole('button', {
          name: 'Compare fingerprint',
        }),
      )
      const dialog = await screen.findByRole('dialog')
      await r.user.click(within(dialog).getByRole('checkbox'))
      await r.user.click(within(dialog).getByRole('button', { name: 'Done' }))
    }
    const seal = screen.getByRole('button', { name: 'Seal and upload shares' })
    await waitFor(() => expect(seal).toBeEnabled())
    await r.user.click(seal)
    expect(
      await screen.findByText('Shares sealed and uploaded', undefined, SLOW),
    ).toBeInTheDocument()
    await waitFor(() => expect(screen.getAllByText('Share is current')).toHaveLength(3))

    const uploads = s.backend.requests.filter(
      (q) => q.method === 'PUT' && q.path.endsWith('/share'),
    )
    expect(uploads).toHaveLength(3)
    for (const u of uploads) {
      const env = (JSON.parse(u.body ?? '{}') as { sealedShare: Record<string, string> })
        .sealedShare
      expect(env.alg).toBe('X25519-HKDF-SHA256-AES256GCM')
    }
    expect((await s.h.owner.getState()).readiness.armable).toBe(true)
  }, 20000)

  it('refuses to seal when the server returns a key that does not match its own fingerprint', async () => {
    const s = await unsealedScenario()
    const original = s.backend.fetch
    ;(s.backend as { fetch: typeof fetch }).fetch = async (input, init) => {
      const res = await original(input, init)
      if (!urlOf(input).endsWith('/vault/trustees') || (init?.method ?? 'GET') !== 'GET') return res
      const list = (await res.json()) as { publicKey: string | null }[]
      const swapped = await generateTrusteeKeyPair() // a hostile server substitutes its own key
      list[0] = { ...list[0]!, publicKey: btoa(String.fromCharCode(...swapped.publicKey)) }
      return new Response(JSON.stringify(list), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      })
    }
    const r = renderApp('/', { mock: s.backend })
    await unlockThroughUi(r, s.keyFile)
    await screen.findByRole('listitem', { name: 'Ada' })
    for (const name of ['Ada', 'Ben', 'Cleo']) {
      await r.user.click(
        within(screen.getByRole('listitem', { name })).getByRole('button', {
          name: 'Compare fingerprint',
        }),
      )
      const dialog = await screen.findByRole('dialog')
      await r.user.click(within(dialog).getByRole('checkbox'))
      await r.user.click(within(dialog).getByRole('button', { name: 'Done' }))
    }
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Seal and upload shares' })).toBeEnabled(),
    )
    await r.user.click(screen.getByRole('button', { name: 'Seal and upload shares' }))
    expect(
      await screen.findByText(
        /does not match its own fingerprint. Do not continue/,
        undefined,
        SLOW,
      ),
    ).toBeInTheDocument()
    expect(s.backend.requests.some((q) => q.method === 'PUT' && q.path.endsWith('/share'))).toBe(
      false,
    )
  }, 20000)

  it('lets you pick t of n with the consequences spelled out, and saves it', async () => {
    const s = await armedScenario({ arm: false })
    const r = renderApp('/trustees', { mock: s.h.backend })
    expect(await screen.findByText(/Any 2 of your 3 trustees/)).toBeInTheDocument()
    await r.user.selectOptions(screen.getByLabelText('Trustees needed (t)'), '3')
    expect(screen.getByText(/no margin/)).toBeInTheDocument()
    await r.user.click(screen.getByRole('button', { name: 'Save quorum' }))
    expect(await screen.findByText('Quorum saved')).toBeInTheDocument()
    expect((await s.h.owner.getState()).policy?.quorum).toBe(3)
  })

  it('sends you to the policy first when the quorum has nowhere to live yet', async () => {
    const backend = new MockBackend()
    const h = createHarness(backend)
    await saveVault(h.owner, generateVaultKey(), sampleDocument, 'create')
    renderApp('/trustees', { mock: backend })
    expect(await screen.findByLabelText('Trustees needed (t)')).toBeDisabled()
    expect(screen.getByText(/The quorum is part of your check-in policy/)).toBeInTheDocument()
  })

  it('confirms before revoking a trustee', async () => {
    const s = await armedScenario({ arm: false })
    const r = renderApp('/trustees', { mock: s.h.backend })
    await r.user.click(
      within(await screen.findByRole('listitem', { name: 'Ben' })).getByRole('button', {
        name: 'Revoke',
      }),
    )
    const dialog = await screen.findByRole('dialog', { name: 'Revoke Ben?' })
    await r.user.click(within(dialog).getByRole('button', { name: 'Revoke Ben' }))
    expect(await screen.findByText('Ben revoked')).toBeInTheDocument()
    expect((await s.h.owner.listTrustees())[1]?.status).toBe('REVOKED')
  })
})
