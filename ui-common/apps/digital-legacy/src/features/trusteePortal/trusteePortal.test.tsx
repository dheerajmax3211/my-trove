import { screen, waitFor, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { createTrusteeKeyFile, serializeTrusteeKeyFile, shareToText } from '../../crypto'
import { MockBackend } from '../../mock/backend'
import { createHarness, DAY_MS } from '../../testing/harness'
import { renderApp, setupBrowserStubs, type Rendered } from '../../testing/render'
import {
  armedScenario,
  sampleDocument,
  SECRET_BODY,
  SECRET_TITLE,
  type Scenario,
} from '../../testing/scenario'
import { generateVaultKey } from '../../crypto'
import { saveVault } from '../vault/vaultService'
import { retrieveShare } from './trusteeService'

const stubs = setupBrowserStubs()
const SLOW = { timeout: 8000 }
const KEY_PASSPHRASE = 'trustee passphrase'

async function keyFileFor(s: Scenario, index: number, passphrase: string | null = KEY_PASSPHRASE) {
  const t = s.trustees[index]
  if (!t) throw new Error('fixture')
  return serializeTrusteeKeyFile(await createTrusteeKeyFile(t.material, passphrase, 100_000))
}

async function signInAs(r: Rendered, s: Scenario, index: number) {
  await r.user.type(await screen.findByLabelText(/^Access token/), s.trustees[index]?.token ?? '')
  await r.user.click(screen.getByRole('button', { name: 'Open my portal' }))
  await screen.findByRole('heading', { name: /Hello, / })
}

async function refresh(r: Rendered) {
  await r.user.click(screen.getByRole('button', { name: 'Refresh' }))
}

describe('accepting an invite', () => {
  it('generates the key pair in the browser, makes you save it, and registers only the public key', async () => {
    const backend = new MockBackend()
    const h = createHarness(backend)
    await saveVault(h.owner, generateVaultKey(), sampleDocument, 'create')
    const invite = await h.owner.invite('Ada')
    const r = renderApp(`/trustee/accept#invite=${invite.inviteToken}`, {
      mock: backend,
      signedIn: false,
    })

    expect(
      await screen.findByRole('heading', { level: 1, name: 'Accept your invite' }),
    ).toBeInTheDocument()
    expect(screen.getByLabelText(/^Invite code/)).toHaveValue(invite.inviteToken)
    const register = screen.getByRole('button', { name: 'Register my key' })
    expect(register).toBeDisabled()

    await r.user.type(screen.getByLabelText('Contact 1 address'), 'ada@example.com')
    await r.user.click(screen.getByRole('button', { name: 'Generate my key' }))
    const shown = (
      await screen.findByLabelText('Your key fingerprint', { selector: 'p' })
    ).textContent?.replace(/\s/g, '')
    expect(shown).toMatch(/^[0-9a-f]{64}$/)
    expect(screen.getByText(/If you lose this file/)).toBeInTheDocument()
    expect(register).toBeDisabled() // not saved yet

    await r.user.type(screen.getByLabelText(/^Passphrase for the key file/), KEY_PASSPHRASE)
    await r.user.click(screen.getByRole('button', { name: 'Download key file' }))
    await screen.findByText('Key file downloaded.', undefined, SLOW)
    await r.user.click(screen.getByRole('checkbox', { name: /saved the key file/ }))
    await r.user.click(register)

    expect(await screen.findByRole('heading', { name: 'You are registered' })).toBeInTheDocument()
    expect(screen.getByText('The server recorded your key correctly')).toBeInTheDocument()
    expect(
      screen
        .getByLabelText('Your key fingerprint', { selector: 'p' })
        .textContent?.replace(/\s/g, ''),
    ).toBe(shown)

    const token = screen.getByLabelText('Access token').textContent ?? ''
    expect(JSON.parse(localStorage.getItem('dl.trustee.session') ?? '{}')).toMatchObject({ token })
    const [trustee] = await h.owner.listTrustees()
    expect(trustee?.keyFingerprint).toBe(shown)

    // the key never reaches browser storage or cookies: the device keeps the access token and the trustee id, nothing else
    const stored = JSON.stringify([{ ...localStorage }, { ...sessionStorage }, document.cookie])
    expect(stored).not.toMatch(/privateKey|pkcs8|passphrase/i)
    const session = JSON.parse(localStorage.getItem('dl.trustee.session') ?? '{}') as Record<
      string,
      unknown
    >
    expect(Object.keys(session).sort()).toEqual(['token', 'trusteeId'])

    // what was sent: public key and contacts, never the private key; the file protects it with the passphrase
    const accept = backend.requests.find((q) => q.path === '/v1/legacy/trustee/accept')
    const body = JSON.parse(accept?.body ?? '{}') as Record<string, unknown>
    expect(Object.keys(body).sort()).toEqual([
      'contacts',
      'inviteToken',
      'keyAlgorithm',
      'publicKey',
    ])
    const file = JSON.parse(stubs.downloads[0]?.text ?? '{}') as {
      privateKey: { protection: string }
      fingerprint: string
    }
    expect(file.privateKey.protection).toBe('passphrase')
    expect(file.fingerprint).toBe(shown)
  }, 20000)

  it('validates contacts and reports an invalid or used invite', async () => {
    const backend = new MockBackend()
    const h = createHarness(backend)
    await saveVault(h.owner, generateVaultKey(), sampleDocument, 'create')
    const r = renderApp('/trustee/accept#invite=not-a-real-invite', {
      mock: backend,
      signedIn: false,
    })
    await r.user.type(await screen.findByLabelText('Contact 1 address'), 'nope')
    await r.user.click(screen.getByRole('button', { name: 'Generate my key' }))
    await screen.findByLabelText('Your key fingerprint', { selector: 'p' })
    await r.user.click(screen.getByRole('button', { name: 'Download key file' }))
    await screen.findByText('Key file downloaded.', undefined, SLOW)
    await r.user.click(screen.getByRole('checkbox', { name: /saved the key file/ }))
    expect(screen.getByRole('button', { name: 'Register my key' })).toBeDisabled()
    await r.user.clear(screen.getByLabelText('Contact 1 address'))
    await r.user.type(screen.getByLabelText('Contact 1 address'), 'ada@example.com')
    await r.user.click(screen.getByRole('button', { name: 'Register my key' }))
    expect(
      await screen.findByText('The invite is invalid, expired or already used'),
    ).toBeInTheDocument()
  }, 20000)
})

describe('trustee sign-in and routing', () => {
  it('needs no owner account', async () => {
    renderApp('/trustee', { signedIn: false })
    expect(
      await screen.findByRole('heading', { level: 1, name: 'Trustee portal' }),
    ).toBeInTheDocument()
    expect(screen.queryByText('Signed out')).not.toBeInTheDocument()
  })

  it('sends you home from the portal when you are not signed in as a trustee', async () => {
    renderApp('/trustee/portal', { signedIn: false })
    expect(
      await screen.findByRole('heading', { level: 1, name: 'Trustee portal' }),
    ).toBeInTheDocument()
  })

  it('rejects a wrong access token, and an owner (bearer) token is not accepted as a trustee token', async () => {
    const s = await armedScenario()
    const r = renderApp('/trustee', { mock: s.h.backend, signedIn: false })
    await r.user.type(await screen.findByLabelText(/^Access token/), 'stub-token-1')
    await r.user.click(screen.getByRole('button', { name: 'Open my portal' }))
    expect(await screen.findByText(/not signed in, or the session has expired/)).toBeInTheDocument()
    expect(localStorage.getItem('dl.trustee.session')).toBeNull()
    expect(
      s.h.backend.requests
        .filter((q) => q.path.includes('/trustee/me'))
        .every((q) => q.authorization === 'Trustee stub-token-1'),
    ).toBe(true)
  })

  it('forgets the device on request', async () => {
    const s = await armedScenario()
    const r = renderApp('/trustee', { mock: s.h.backend, signedIn: false })
    await signInAs(r, s, 0)
    expect(localStorage.getItem('dl.trustee.session')).not.toBeNull()
    await r.user.click(screen.getByRole('button', { name: 'Forget this device' }))
    expect(
      await screen.findByRole('heading', { level: 1, name: 'Trustee portal' }),
    ).toBeInTheDocument()
    expect(localStorage.getItem('dl.trustee.session')).toBeNull()
  })

  it('explains a revoked token', async () => {
    const s = await armedScenario()
    const r = renderApp('/trustee', { mock: s.h.backend, signedIn: false })
    await signInAs(r, s, 0)
    await s.h.owner.disarm()
    await s.h.owner.revokeTrustee(s.trustees[0]?.id ?? '')
    await refresh(r)
    expect(await screen.findByText('This access token no longer works')).toBeInTheDocument()
  })
})

describe('the portal through release', () => {
  it('shows the coarse phase, confirms receipt, votes with an explanation, and can change its mind', async () => {
    const s = await armedScenario()
    const r = renderApp('/trustee', { mock: s.h.backend, signedIn: false })
    await signInAs(r, s, 0)
    expect(screen.getByText('Waiting')).toBeInTheDocument()
    expect(screen.getByText(/nothing for you to do/)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Approve release' })).not.toBeInTheDocument()

    await r.user.click(screen.getByRole('button', { name: 'Confirm I received my share' }))
    expect(await screen.findByText('Receipt confirmed', { selector: 'span' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Confirm I received my share' })).toBeDisabled()

    s.h.backend.advance(17 * DAY_MS + 3600_000)
    await refresh(r)
    expect(
      await screen.findByRole('heading', { name: 'Should the vault be released?' }),
    ).toBeInTheDocument()
    expect(screen.getByText(/2 trustees must approve/)).toBeInTheDocument()
    expect(
      screen.getByText(/cool-off period during which the owner can still check in/),
    ).toBeInTheDocument()

    await r.user.click(screen.getByRole('button', { name: 'Approve release' }))
    const dialog = await screen.findByRole('dialog', { name: 'Approve release of this vault?' })
    expect(within(dialog).getByText(/A check-in from the owner cancels it/)).toBeInTheDocument()
    await r.user.click(within(dialog).getByRole('button', { name: 'Yes, approve' }))
    expect(await screen.findByText(/Your current answer:/)).toHaveTextContent('approve')
    expect((await s.h.owner.getState()).quorum.approved).toBe(1)

    await r.user.click(screen.getByRole('button', { name: 'Decline' }))
    await waitFor(() =>
      expect(screen.getByText(/Your current answer:/)).toHaveTextContent('decline'),
    )
    expect((await s.h.owner.getState()).quorum.approved).toBe(0)
  })

  it('an owner check-in during voting takes the vote buttons away', async () => {
    const s = await armedScenario()
    const r = renderApp('/trustee', { mock: s.h.backend, signedIn: false })
    await signInAs(r, s, 0)
    s.h.backend.advance(17 * DAY_MS + 3600_000)
    await refresh(r)
    await screen.findByRole('button', { name: 'Approve release' })
    await s.h.owner.checkIn()
    await refresh(r)
    await waitFor(() =>
      expect(screen.queryByRole('button', { name: 'Approve release' })).not.toBeInTheDocument(),
    )
    expect(screen.getByText('Waiting')).toBeInTheDocument()
  })

  async function released() {
    const s = await armedScenario()
    s.h.backend.advance(17 * DAY_MS + 3600_000)
    await s.trustees[1]?.api.vote('APPROVE')
    await s.trustees[2]?.api.vote('APPROVE')
    s.h.backend.advance(3 * DAY_MS + 3600_000)
    return s
  }

  it("after release: unseal with the key file, then combine with a second trustee's share and read the vault", async () => {
    const s = await released()
    const r = renderApp('/trustee', { mock: s.h.backend, signedIn: false })
    await signInAs(r, s, 0)
    expect(
      await screen.findByText('Released', { selector: 'span.badge, span.badge *' }),
    ).toBeInTheDocument()

    await r.user.click(screen.getByLabelText(/Your key file: or paste/))
    await r.user.paste(await keyFileFor(s, 0))
    await r.user.type(screen.getByLabelText(/^Key file passphrase/), KEY_PASSPHRASE)
    await r.user.click(screen.getByRole('button', { name: 'Fetch and open my share' }))
    expect(await screen.findByText('Your share is open', undefined, SLOW)).toBeInTheDocument()
    const myText = screen.getByLabelText<HTMLTextAreaElement>('Your share, as text').value
    expect(myText).toMatch(/^DLSHARE1:/)
    expect(s.h.backend.requests.some((q) => q.path === '/v1/legacy/trustee/share')).toBe(true)

    await r.user.click(screen.getByRole('link', { name: 'Go to the combine screen' }))
    expect(
      await screen.findByRole('heading', { level: 1, name: 'Combine shares' }),
    ).toBeInTheDocument()
    expect(screen.getByLabelText('Share 1')).toHaveValue(myText)

    // one share is not enough
    await r.user.click(screen.getByRole('button', { name: 'Combine and decrypt' }))
    expect(await screen.findByText(/need 2 shares but only 1 supplied/)).toBeInTheDocument()
    expect(screen.queryByText(SECRET_BODY)).not.toBeInTheDocument()

    // a second trustee hands over their opened share
    const ben = s.trustees[1]
    if (!ben) throw new Error('fixture')
    const benShare = shareToText((await retrieveShare(ben.api, ben.material)).share)
    await r.user.click(screen.getByLabelText('Share 2'))
    await r.user.paste(benShare)
    expect(
      await screen.findAllByText(/Share number \d of set [0-9a-f]{8}, needs 2/, undefined, SLOW),
    ).toHaveLength(2)
    await r.user.click(screen.getByRole('button', { name: 'Combine and decrypt' }))
    expect(await screen.findByRole('heading', { name: SECRET_TITLE })).toBeInTheDocument()
    expect(screen.getByText(SECRET_BODY)).toBeInTheDocument()

    await r.user.click(screen.getByRole('button', { name: 'Clear from screen' }))
    expect(screen.queryByText(SECRET_BODY)).not.toBeInTheDocument()

    // the server saw requests for the share and ciphertext, never the plaintext
    for (const q of s.h.backend.requests)
      expect(`${q.path}${q.body ?? ''}`).not.toContain('swordfish')
  }, 30000)

  it('a wrong key file says so clearly, as does a wrong passphrase and a file of the wrong kind', async () => {
    const s = await released()
    const r = renderApp('/trustee/portal', { mock: s.h.backend, signedIn: false })
    await signInAs(r, s, 0).catch(() => undefined)
    if (!screen.queryByRole('heading', { name: /Hello, / })) {
      await r.user.type(await screen.findByLabelText(/^Access token/), s.trustees[0]?.token ?? '')
      await r.user.click(screen.getByRole('button', { name: 'Open my portal' }))
    }
    await screen.findByLabelText(/Your key file: or paste/)

    await r.user.click(screen.getByLabelText(/Your key file: or paste/))
    await r.user.paste(await keyFileFor(s, 1)) // Ben's key, not Ada's
    await r.user.type(screen.getByLabelText(/^Key file passphrase/), KEY_PASSPHRASE)
    await r.user.click(screen.getByRole('button', { name: 'Fetch and open my share' }))
    expect(
      await screen.findByText(/does not belong to your registration/, undefined, SLOW),
    ).toBeInTheDocument()

    await r.user.clear(screen.getByLabelText(/Your key file: or paste/))
    await r.user.paste(await keyFileFor(s, 0))
    await r.user.clear(screen.getByLabelText(/^Key file passphrase/))
    await r.user.type(screen.getByLabelText(/^Key file passphrase/), 'not the passphrase')
    await r.user.click(screen.getByRole('button', { name: 'Fetch and open my share' }))
    expect(
      await screen.findByText(/passphrase is wrong, or the file was altered/, undefined, SLOW),
    ).toBeInTheDocument()

    await r.user.clear(screen.getByLabelText(/Your key file: or paste/))
    await r.user.paste('{"not":"a key file"}')
    await r.user.click(screen.getByRole('button', { name: 'Fetch and open my share' }))
    expect(await screen.findByText('This is not a trustee key file')).toBeInTheDocument()
  }, 30000)

  it('an RSA trustee can open their share too', async () => {
    const s = await released()
    const cleo = s.trustees[2]
    if (!cleo) throw new Error('fixture')
    expect(cleo.material.algorithm).toBe('RSA-OAEP')
    const r = renderApp('/trustee', { mock: s.h.backend, signedIn: false })
    await signInAs(r, s, 2)
    await r.user.click(screen.getByLabelText(/Your key file: or paste/))
    await r.user.paste(await keyFileFor(s, 2, null))
    await r.user.click(screen.getByRole('button', { name: 'Fetch and open my share' }))
    expect(await screen.findByText('Your share is open', undefined, SLOW)).toBeInTheDocument()
  }, 30000)

  it('combine is not available before release', async () => {
    const s = await armedScenario()
    const r = renderApp('/trustee', { mock: s.h.backend, signedIn: false })
    await signInAs(r, s, 0)
    await r.user.click(screen.getByRole('link', { name: 'Combine shares' }))
    expect(
      await screen.findByRole('heading', { name: 'Nothing to combine yet' }),
    ).toBeInTheDocument()
  })

  it('rejects pasted text that is not a share, and mismatched shares from another vault', async () => {
    const s = await released()
    const other = await released()
    const r = renderApp('/trustee', { mock: s.h.backend, signedIn: false })
    await signInAs(r, s, 0)
    await r.user.click(screen.getByRole('link', { name: 'Combine shares' }))
    await r.user.click(await screen.findByLabelText('Share 1'))
    await r.user.paste('hello there')
    expect(await screen.findByText(/does not look like a share/)).toBeInTheDocument()

    const mine = shareToText(
      (await retrieveShare(s.trustees[1]!.api, s.trustees[1]!.material)).share,
    )
    const theirs = shareToText(
      (await retrieveShare(other.trustees[1]!.api, other.trustees[1]!.material)).share,
    )
    await r.user.clear(screen.getByLabelText('Share 1'))
    await r.user.paste(mine)
    await r.user.click(screen.getByLabelText('Share 2'))
    await r.user.paste(theirs)
    await r.user.click(screen.getByRole('button', { name: 'Combine and decrypt' }))
    expect(await screen.findByText(/different splits|duplicate share/)).toBeInTheDocument()
  }, 30000)
})
