import { screen, waitFor, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { createMockBackend } from '../../mock/backend'
import { callsTo, dialog, pageHeading, renderApp } from '../../test/utils'

async function openVault(seed: 'demo' | 'empty' = 'demo') {
  const app = renderApp({ route: '/vault', seed })
  await pageHeading('Vault')
  return app
}

async function showTable(user: ReturnType<typeof renderApp>['user']) {
  await user.click(await screen.findByRole('tab', { name: 'Table' }))
}

describe('vault', () => {
  it('shows attributes as a tree grouped by key path, with sensitivity badges', async () => {
    const { user } = await openVault()
    const tree = await screen.findByRole('list', { name: 'Vault attributes by key path' })
    expect(within(tree).getByRole('button', { name: 'profile' })).toHaveAttribute(
      'aria-expanded',
      'true',
    )
    expect(within(tree).getByText('shoe')).toBeInTheDocument()
    expect(within(tree).getByText('RESTRICTED')).toBeInTheDocument()

    await user.click(within(tree).getByRole('button', { name: 'profile' }))
    expect(within(tree).queryByText('shoe')).not.toBeInTheDocument()
    expect(within(tree).getByRole('button', { name: 'profile' })).toHaveAttribute(
      'aria-expanded',
      'false',
    )
  })

  it('lists full key paths in the table view and filters them', async () => {
    const { user } = await openVault()
    await showTable(user)
    expect(await screen.findByText('profile.sizes.shoe')).toBeInTheDocument()
    await user.type(screen.getByLabelText('Filter by key path'), 'health')
    expect(screen.queryByText('profile.sizes.shoe')).not.toBeInTheDocument()
    expect(screen.getByText('health.allergies')).toBeInTheDocument()
    await user.clear(screen.getByLabelText('Filter by key path'))
    await user.type(screen.getByLabelText('Filter by key path'), 'zzz')
    expect(await screen.findByRole('heading', { name: 'No attributes match' })).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Clear filter' }))
    expect(await screen.findByRole('tab', { name: 'Table' })).toBeInTheDocument()
  })

  it('shows an empty state with a next action when the vault is empty', async () => {
    const { user } = await openVault('empty')
    expect(await screen.findByRole('heading', { name: 'Your vault is empty' })).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Add your first attribute' }))
    expect(screen.getByRole('dialog', { name: 'Add attribute' })).toBeInTheDocument()
  })

  it('adds an attribute with a JSON value and shows it in the vault', async () => {
    const { user, backend } = await openVault()
    await user.click(screen.getByRole('button', { name: 'Add attribute' }))
    const form = dialog()
    await user.type(form.getByLabelText(/^Key path/), 'profile.sizes.hat')
    await user.click(form.getByLabelText(/^Value \(JSON\)/))
    await user.paste('"M"')
    await user.selectOptions(form.getByLabelText(/^Sensitivity/), 'PUBLIC')
    await user.click(form.getByRole('button', { name: 'Save attribute' }))

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    expect(await screen.findByText('Attribute added')).toBeInTheDocument()
    expect(callsTo(backend, 'POST', '/vault/attributes')[0]?.body).toEqual({
      keyPath: 'profile.sizes.hat',
      value: 'M',
      sensitivity: 'PUBLIC',
    })
    await showTable(user)
    expect(await screen.findByRole('cell', { name: 'profile.sizes.hat' })).toBeInTheDocument()
  })

  it('rejects invalid JSON, null and bad key paths without calling the server', async () => {
    const { user, backend } = await openVault()
    await user.click(screen.getByRole('button', { name: 'Add attribute' }))
    const form = dialog()
    await user.type(form.getByLabelText(/^Key path/), 'Bad Key')
    await user.click(form.getByLabelText(/^Value \(JSON\)/))
    await user.paste('{oops')
    await user.click(form.getByRole('button', { name: 'Save attribute' }))
    expect(
      await form.findByText(/Use lowercase letters, digits and underscores/),
    ).toBeInTheDocument()
    expect(form.getByText(/This is not valid JSON/)).toBeInTheDocument()
    expect(form.getByRole('button', { name: 'Format JSON' })).toBeDisabled()

    await user.clear(form.getByLabelText(/^Key path/))
    await user.type(form.getByLabelText(/^Key path/), 'profile.nothing')
    await user.clear(form.getByLabelText(/^Value \(JSON\)/))
    await user.click(form.getByLabelText(/^Value \(JSON\)/))
    await user.paste('null')
    expect(await form.findByText(/cannot be null/)).toBeInTheDocument()
    expect(callsTo(backend, 'POST', '/vault/attributes')).toHaveLength(0)
    expect(screen.getByRole('dialog')).toBeInTheDocument()
  })

  it('formats valid JSON and accepts objects', async () => {
    const { user } = await openVault()
    await user.click(screen.getByRole('button', { name: 'Add attribute' }))
    const form = dialog()
    await user.click(form.getByLabelText(/^Value \(JSON\)/))
    await user.paste('{"a":1,"b":[true]}')
    await user.click(form.getByRole('button', { name: 'Format JSON' }))
    expect(form.getByLabelText(/^Value \(JSON\)/)).toHaveValue(
      '{\n  "a": 1,\n  "b": [\n    true\n  ]\n}',
    )
  })

  it('shows the server conflict on the key path when the attribute already exists', async () => {
    const { user } = await openVault()
    await user.click(screen.getByRole('button', { name: 'Add attribute' }))
    const form = dialog()
    await user.type(form.getByLabelText(/^Key path/), 'profile.name')
    await user.click(form.getByLabelText(/^Value \(JSON\)/))
    await user.paste('"Someone"')
    await user.click(form.getByRole('button', { name: 'Save attribute' }))
    expect(await form.findByText('Attribute already exists: profile.name')).toBeInTheDocument()
    expect(screen.getByRole('dialog')).toBeInTheDocument()
  })

  it('edits an attribute: the key path is fixed, value and sensitivity change', async () => {
    const { user, backend } = await openVault()
    await showTable(user)
    await user.click(await screen.findByRole('button', { name: 'Edit profile.sizes.shoe' }))
    const form = dialog()
    expect(form.getByLabelText(/^Key path/)).toHaveAttribute('readonly')
    expect(form.getByLabelText(/^Value \(JSON\)/)).toHaveValue('42')
    await user.clear(form.getByLabelText(/^Value \(JSON\)/))
    await user.click(form.getByLabelText(/^Value \(JSON\)/))
    await user.paste('43')
    await user.selectOptions(form.getByLabelText(/^Sensitivity/), 'SENSITIVE')
    await user.click(form.getByRole('button', { name: 'Save attribute' }))

    expect(await screen.findByText('Attribute saved')).toBeInTheDocument()
    expect(callsTo(backend, 'PUT', '/vault/attributes/profile.sizes.shoe')[0]?.body).toEqual({
      value: 43,
      sensitivity: 'SENSITIVE',
    })
    const row = (await screen.findByRole('cell', { name: 'profile.sizes.shoe' })).closest('tr')
    expect(row).not.toBeNull()
    expect(within(row as HTMLElement).getByText('43')).toBeInTheDocument()
    expect(within(row as HTMLElement).getByText('SENSITIVE')).toBeInTheDocument()
  })

  it('asks for confirmation before deleting, and keeps the attribute on cancel', async () => {
    const { user, backend } = await openVault()
    await showTable(user)
    await user.click(await screen.findByRole('button', { name: 'Delete profile.sizes.shirt' }))
    expect(screen.getByRole('dialog', { name: 'Delete this attribute?' })).toBeInTheDocument()
    await user.click(dialog().getByRole('button', { name: 'Cancel' }))
    expect(screen.getByText('profile.sizes.shirt')).toBeInTheDocument()
    expect(callsTo(backend, 'DELETE', '/vault')).toHaveLength(0)

    await user.click(screen.getByRole('button', { name: 'Delete profile.sizes.shirt' }))
    await user.click(dialog().getByRole('button', { name: 'Delete attribute' }))
    await waitFor(() =>
      expect(
        screen.queryByRole('button', { name: 'Delete profile.sizes.shirt' }),
      ).not.toBeInTheDocument(),
    )
    expect(callsTo(backend, 'DELETE', '/vault/attributes/profile.sizes.shirt')).toHaveLength(1)
    expect(await screen.findByText('Attribute deleted')).toBeInTheDocument()
  })

  it('shows a readable error with a retry when the vault cannot load', async () => {
    const backend = createMockBackend()
    backend.failNext(/GET \/v1\/owner\/vault\/attributes/, 503, 'down')
    const { user } = renderApp({ route: '/vault', backend })
    expect(await screen.findByRole('alert')).toHaveTextContent('The gateway had a problem')
    await user.click(screen.getByRole('button', { name: 'Try again' }))
    expect(
      await screen.findByRole('list', { name: 'Vault attributes by key path' }),
    ).toBeInTheDocument()
  })

  it('explains when the gateway cannot be reached at all', async () => {
    const backend = createMockBackend()
    backend.setOffline(true)
    renderApp({ route: '/vault', backend })
    expect(await screen.findByText('Cannot reach the gateway')).toBeInTheDocument()
  })
})
