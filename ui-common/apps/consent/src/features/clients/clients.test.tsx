import { cleanup, screen, waitFor, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { createMockBackend } from '../../mock/backend'
import { paths } from '../../shared/api/paths'
import { callsTo, dialog, pageHeading, renderApp } from '../../test/utils'

async function openClients(options: Parameters<typeof renderApp>[0] = {}) {
  const app = renderApp({ route: '/clients', ...options })
  await pageHeading('Apps')
  return app
}

async function register(user: ReturnType<typeof renderApp>['user']) {
  await user.click(screen.getByRole('button', { name: 'Register app' }))
  const form = dialog()
  await user.type(form.getByLabelText(/^App name/), 'Fit Finder')
  await user.type(form.getByLabelText(/^Contact email/), 'dev@fitfinder.example')
  await user.click(form.getByLabelText(/^Allowed scopes/))
  await user.paste('profile.sizes\nhealth.allergies:read')
  await user.click(form.getByRole('button', { name: 'Register app' }))
}

/** The value shown next to a label ("Client ID", "Client secret") inside the open dialog. */
const credential = (label: string) => {
  const caption = within(screen.getByRole('dialog')).getByText(label)
  return within(caption.parentElement as HTMLElement).getByText(/^(cl_|cs_)/)
}

describe('apps (clients)', () => {
  it('lists registered apps and never shows a secret', async () => {
    const { backend } = await openClients()
    const list = await screen.findByRole('list', { name: 'Registered apps' })
    expect(within(list).getAllByRole('group')).toHaveLength(3)
    expect(within(list).getByText('Stride Shoes')).toBeInTheDocument()
    expect(within(list).getAllByText(/The value is never shown again/)).toHaveLength(3)
    expect(document.body.textContent).not.toContain('cs_')
    expect(backend.calls.every((c) => c.method === 'GET')).toBe(true)
  })

  it('validates the registration form before calling the server', async () => {
    const { user, backend } = await openClients()
    await screen.findByRole('list', { name: 'Registered apps' })
    await user.click(screen.getByRole('button', { name: 'Register app' }))
    await user.click(dialog().getByRole('button', { name: 'Register app' }))
    expect(await dialog().findByText('Give the app a name you will recognise.')).toBeInTheDocument()
    expect(callsTo(backend, 'POST', '/clients')).toHaveLength(0)

    await user.type(dialog().getByLabelText(/^App name/), 'X')
    await user.type(dialog().getByLabelText(/^Contact email/), 'nope')
    await user.click(dialog().getByLabelText(/^Allowed scopes/))
    await user.paste('Bad Scope')
    await user.click(dialog().getByRole('button', { name: 'Register app' }))
    expect(await dialog().findByText('Enter a valid email address.')).toBeInTheDocument()
    expect(callsTo(backend, 'POST', '/clients')).toHaveLength(0)
  })

  it('registers an app and reveals the id and secret exactly once, with a warning and copy', async () => {
    const { user, backend, runtime } = await openClients()
    await screen.findByRole('list', { name: 'Registered apps' })
    await register(user)

    const secretDialog = await screen.findByRole('dialog', { name: 'Save your client secret' })
    expect(within(secretDialog).getByRole('alert')).toHaveTextContent(
      'This is the only time the secret is shown',
    )
    const clientId = credential('Client ID').textContent ?? ''
    const secret = credential('Client secret').textContent ?? ''
    expect(callsTo(backend, 'POST', '/clients')[0]?.body).toEqual({
      name: 'Fit Finder',
      contactEmail: 'dev@fitfinder.example',
      allowedScopes: ['health.allergies:read', 'profile.sizes:read'],
    })
    expect(backend.secretOf(clientId)).toBe(secret)

    await user.click(within(secretDialog).getByRole('button', { name: 'Copy client secret' }))
    expect(await navigator.clipboard.readText()).toBe(secret)

    // It cannot be dismissed by accident: no close button, and Escape does nothing.
    expect(within(secretDialog).queryByRole('button', { name: 'Close' })).not.toBeInTheDocument()
    await user.keyboard('{Escape}')
    expect(screen.getByRole('dialog', { name: 'Save your client secret' })).toBeInTheDocument()

    await user.click(within(secretDialog).getByRole('button', { name: 'I have saved the secret' }))
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    expect(screen.queryByText(secret)).not.toBeInTheDocument()
    expect(document.body.textContent).not.toContain(secret)
    expect(await screen.findByText('Fit Finder')).toBeInTheDocument()
    // Neither the list nor the query library's mutation cache keeps it.
    await waitFor(() => expect(runtime.queryClient.getMutationCache().getAll()).toHaveLength(0))
    expect(
      JSON.stringify(
        runtime.queryClient
          .getQueryCache()
          .getAll()
          .map((q) => q.state.data),
      ),
    ).not.toContain(secret)
  })

  it('never shows the secret again after a reload', async () => {
    const backend = createMockBackend()
    const first = await openClients({ backend })
    await screen.findByRole('list', { name: 'Registered apps' })
    await register(first.user)
    await screen.findByRole('dialog', { name: 'Save your client secret' })
    const secret = credential('Client secret').textContent ?? ''
    expect(secret).toMatch(/^cs_/)

    cleanup()
    await openClients({ backend })
    expect(await screen.findByText('Fit Finder')).toBeInTheDocument()
    expect(document.body.textContent).not.toContain(secret)
  })

  it('rotates a secret after confirmation, shows the new one once and invalidates the old one', async () => {
    const { user, backend, runtime } = await openClients()
    const all = await runtime.apiClient.get<{ clientId: string; name: string }[]>(paths.clients)
    const strideId = all.find((c) => c.name === 'Stride Shoes')?.clientId ?? ''
    const before = backend.secretOf(strideId)
    await user.click(await screen.findByRole('button', { name: 'Rotate secret for Stride Shoes' }))
    expect(
      screen.getByRole('dialog', { name: 'Rotate the secret for Stride Shoes?' }),
    ).toBeInTheDocument()
    await user.click(dialog().getByRole('button', { name: 'Rotate secret' }))

    const secretDialog = await screen.findByRole('dialog', { name: 'Your new client secret' })
    const shown = credential('Client secret').textContent
    expect(shown).toBe(backend.secretOf(strideId))
    expect(shown).not.toBe(before)
    expect(within(secretDialog).getByRole('alert')).toHaveTextContent(
      'The old secret has already stopped working',
    )
    await user.click(within(secretDialog).getByRole('button', { name: 'I have saved the secret' }))
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    expect(document.body.textContent).not.toContain(shown ?? 'never')
  })

  it('disables an app after confirmation: its grants are revoked and it cannot be rotated again', async () => {
    const { user, backend } = await openClients()
    await user.click(await screen.findByRole('button', { name: 'Disable Stride Shoes' }))
    const confirm = screen.getByRole('dialog', { name: 'Disable Stride Shoes?' })
    expect(within(confirm).getByText(/1 active grant is revoked/)).toBeInTheDocument()
    await user.click(within(confirm).getByRole('button', { name: 'Cancel' }))
    expect(callsTo(backend, 'DELETE', '/clients')).toHaveLength(0)

    await user.click(screen.getByRole('button', { name: 'Disable Stride Shoes' }))
    await user.click(dialog().getByRole('button', { name: 'Disable app' }))
    expect(await screen.findByText('App disabled')).toBeInTheDocument()
    const group = await screen.findByRole('group', { name: 'Stride Shoes' })
    await waitFor(() =>
      expect(within(group).getByText('Disabled', { selector: 'span' })).toBeInTheDocument(),
    )
    expect(within(group).queryByRole('button', { name: /Rotate secret/ })).not.toBeInTheDocument()
    expect(within(group).queryByRole('button', { name: /Disable/ })).not.toBeInTheDocument()

    await user.click(screen.getByRole('link', { name: 'Grants' }))
    expect(
      await screen.findByRole('heading', { name: 'No app has access right now' }),
    ).toBeInTheDocument()
  })

  it('links to the activity of one app', async () => {
    const { user } = await openClients()
    await user.click(await screen.findByRole('link', { name: 'View activity for Stride Shoes' }))
    await pageHeading('Access history')
    expect(await screen.findByLabelText('Show activity for')).toHaveDisplayValue('Stride Shoes')
  })

  it('shows an empty state with a next action when no app is registered', async () => {
    const { user } = await openClients({ seed: 'empty' })
    expect(await screen.findByRole('heading', { name: 'No apps registered' })).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Register your first app' }))
    expect(screen.getByRole('dialog', { name: 'Register an app' })).toBeInTheDocument()
  })

  it('keeps the form open and explains when registration fails on the server', async () => {
    const backend = createMockBackend()
    const { user } = await openClients({ backend })
    await screen.findByRole('list', { name: 'Registered apps' })
    backend.failNext(/POST \/v1\/owner\/clients$/, 500, 'boom')
    await register(user)
    expect(await dialog().findByText(/This is not your fault/)).toBeInTheDocument()
    expect(
      screen.queryByRole('dialog', { name: 'Save your client secret' }),
    ).not.toBeInTheDocument()
  })
})
