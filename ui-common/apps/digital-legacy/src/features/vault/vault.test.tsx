import { screen, waitFor, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { createVaultKeyFile, serializeVaultKeyFile } from '../../crypto'
import { armedScenario, SECRET_BODY, SECRET_TITLE } from '../../testing/scenario'
import { renderApp, setupBrowserStubs, type Rendered } from '../../testing/render'

const PASSPHRASE = 'correct horse battery staple'
const SLOW = { timeout: 8000 }

async function createVaultThroughUi(r: Rendered, stubs: ReturnType<typeof setupBrowserStubs>) {
  const { user } = r
  await screen.findByRole('heading', { level: 1, name: 'Vault' })
  await user.type(await screen.findByLabelText('Title of entry 1'), 'Bank')
  await user.type(screen.getByLabelText('Contents of entry 1'), 'Account 12345, PIN 4321')
  await user.click(screen.getByRole('button', { name: 'Encrypt and create vault' }))
  const dialog = await screen.findByRole('dialog', { name: 'Back up your vault key' })
  const confirm = within(dialog).getByRole('button', { name: 'Create vault' })
  expect(confirm).toBeDisabled()
  await user.type(within(dialog).getByLabelText(/^Passphrase/), PASSPHRASE)
  await user.type(within(dialog).getByLabelText(/^Repeat the passphrase/), PASSPHRASE)
  await user.click(within(dialog).getByRole('button', { name: 'Download key file' }))
  await within(dialog).findByText('Key file downloaded.', undefined, SLOW)
  await waitFor(() => expect(stubs.downloads).toHaveLength(1))
  expect(confirm).toBeDisabled() // still needs the "I saved it" confirmation
  await user.click(within(dialog).getByRole('checkbox'))
  await user.click(confirm)
  await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
}

describe('vault editor', () => {
  const stubs = setupBrowserStubs()

  it('encrypts in the browser: creating a vault uploads only ciphertext and a key file is produced', async () => {
    const r = renderApp('/vault')
    await createVaultThroughUi(r, stubs)

    expect(await screen.findByText('Saved')).toBeInTheDocument()
    expect(stubs.downloads[0]?.name).toBe('digital-legacy-vault-key.json')
    expect(stubs.downloads[0]?.text).not.toContain('PIN 4321')

    const create = r.mock.requests.find((q) => q.method === 'POST' && q.path === '/v1/legacy/vault')
    expect(create).toBeDefined()
    const body = JSON.parse(create?.body ?? '{}') as Record<string, unknown>
    expect(Object.keys(body).sort()).toEqual(['ciphertext', 'metadata'])
    for (const request of r.mock.requests) {
      expect(`${request.path}${request.body ?? ''}`).not.toContain('PIN 4321')
      expect(`${request.path}${request.body ?? ''}`).not.toContain('Bank')
    }
    expect(screen.getByText('What the server holds')).toBeInTheDocument()
  }, 20000)

  it('never writes the plaintext or the key to browser storage', async () => {
    const r = renderApp('/vault')
    await createVaultThroughUi(r, stubs)
    await screen.findByText('Saved')
    const stored = JSON.stringify({ ...localStorage }) + JSON.stringify({ ...sessionStorage })
    expect(stored).not.toContain('PIN 4321')
    expect(stored).not.toContain('Bank')
    expect(stored).not.toContain(PASSPHRASE)
  }, 20000)

  it('locks on reload: the key file and passphrase bring the vault back, a wrong passphrase does not', async () => {
    const s = await armedScenario({ arm: false })
    const file = serializeVaultKeyFile(await createVaultKeyFile(s.vaultKey, PASSPHRASE, 100_000))
    const r = renderApp('/vault', { mock: s.h.backend })

    expect(await screen.findByRole('heading', { name: 'Unlock your vault' })).toBeInTheDocument()
    expect(screen.getByText('Vault key locked')).toBeInTheDocument()
    expect(screen.queryByText(SECRET_BODY)).not.toBeInTheDocument()

    await r.user.click(screen.getByLabelText(/Vault key file: or paste/))
    await r.user.paste(file)
    await r.user.type(screen.getByLabelText(/^Passphrase/), 'wrong passphrase here')
    await r.user.click(screen.getByRole('button', { name: 'Unlock vault' }))
    expect(
      await screen.findByText(/passphrase is wrong, or the file was altered/i, undefined, SLOW),
    ).toBeInTheDocument()

    await r.user.clear(screen.getByLabelText(/^Passphrase/))
    await r.user.type(screen.getByLabelText(/^Passphrase/), PASSPHRASE)
    await r.user.click(screen.getByRole('button', { name: 'Unlock vault' }))
    expect(await screen.findByDisplayValue(SECRET_TITLE, undefined, SLOW)).toBeInTheDocument()
    expect(screen.getByDisplayValue(SECRET_BODY)).toBeInTheDocument()
    expect(screen.getByText('Vault key unlocked')).toBeInTheDocument()
  }, 20000)

  it("rejects a key file that is not this vault's key, and a file that is not a key file", async () => {
    const s = await armedScenario({ arm: false })
    const other = serializeVaultKeyFile(
      await createVaultKeyFile(crypto.getRandomValues(new Uint8Array(32)), PASSPHRASE, 100_000),
    )
    const r = renderApp('/vault', { mock: s.h.backend })
    await screen.findByRole('heading', { name: 'Unlock your vault' })
    await r.user.click(screen.getByLabelText(/Vault key file: or paste/))
    await r.user.paste(other)
    await r.user.type(screen.getByLabelText(/^Passphrase/), PASSPHRASE)
    await r.user.click(screen.getByRole('button', { name: 'Unlock vault' }))
    expect(await screen.findByText(/does not open this data/i, undefined, SLOW)).toBeInTheDocument()

    await r.user.clear(screen.getByLabelText(/Vault key file: or paste/))
    await r.user.paste('{"hello":"world"}')
    await r.user.click(screen.getByRole('button', { name: 'Unlock vault' }))
    expect(
      await screen.findByText('This is not a vault key file', undefined, SLOW),
    ).toBeInTheDocument()
  }, 20000)
})
