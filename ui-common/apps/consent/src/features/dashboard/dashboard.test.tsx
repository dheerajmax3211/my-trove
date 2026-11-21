import { screen, waitFor, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { createMockBackend } from '../../mock/backend'
import { callsTo, dialog, pageHeading, renderApp } from '../../test/utils'

async function openDashboard(options: Parameters<typeof renderApp>[0] = {}) {
  const app = renderApp(options)
  await pageHeading('Who can see what')
  return app
}

const stat = (name: string) => screen.findByRole('group', { name })

describe('dashboard', () => {
  it('puts pending requests first, in plain words, with a decision on each', async () => {
    await openDashboard()
    const band = await screen.findByRole('region', { name: 'Waiting for your decision' })
    const requests = within(within(band).getByRole('list', { name: 'Pending requests' }))
    expect(requests.getAllByRole('group')).toHaveLength(2)
    const stride = within(requests.getByRole('group', { name: 'Stride Shoes' }))
    expect(
      stride.getByText(/Wants to read 2 parts of your vault for 7 days, up to 20 reads/),
    ).toBeInTheDocument()
    expect(stride.getByText('Recommend shoes and jackets that fit')).toBeInTheDocument()
    expect(stride.getByRole('button', { name: 'Review and approve Stride Shoes' })).toBeVisible()
    expect(stride.getByRole('button', { name: 'Deny Stride Shoes' })).toBeVisible()
  })

  it('summarises the picture in a sentence and three figures', async () => {
    await openDashboard()
    expect(
      await screen.findByText(/2 requests are waiting for your decision\. 1 app can read/),
    ).toBeInTheDocument()
    expect(within(await stat('Waiting for you')).getByText('2')).toBeInTheDocument()
    expect(within(await stat('Apps with access')).getByText('1')).toBeInTheDocument()
    await waitFor(async () =>
      expect(within(await stat('Attributes in your vault')).queryByText('–')).toBeNull(),
    )
  })

  it('lists who has access now with scopes, expiry, reads used and a revoke button', async () => {
    const { user, backend } = await openDashboard()
    const grants = await screen.findByRole('list', { name: 'Active grants' })
    expect(within(grants).getByText('Stride Shoes')).toBeInTheDocument()
    expect(within(grants).getByText('profile.sizes:read')).toBeInTheDocument()
    expect(within(grants).getByText('3 of 100 reads')).toBeInTheDocument()
    expect(within(grants).getByText(/^Until /)).toBeInTheDocument()

    await user.click(within(grants).getByRole('button', { name: 'Revoke access for Stride Shoes' }))
    await user.click(dialog().getByRole('button', { name: 'Revoke access' }))
    expect((await screen.findAllByText('Access revoked')).length).toBeGreaterThan(0)
    expect(callsTo(backend, 'POST', '/revoke')).toHaveLength(1)
    expect(await screen.findByRole('heading', { name: 'No app has access' })).toBeInTheDocument()
  })

  it('approves a request straight from the home page', async () => {
    const { user, backend } = await openDashboard()
    await user.click(await screen.findByRole('button', { name: 'Review and approve Stride Shoes' }))
    await user.click(dialog().getByRole('button', { name: 'Approve access' }))
    expect(await screen.findByText('Access approved')).toBeInTheDocument()
    expect(callsTo(backend, 'POST', '/approve')).toHaveLength(1)
    await waitFor(() =>
      expect(screen.queryByRole('group', { name: 'Stride Shoes' })).not.toBeInTheDocument(),
    )
  })

  it('shows the vault summary, recent activity and the chain status with a verify action', async () => {
    const { user, backend } = await openDashboard()
    const recent = await screen.findByRole('list', { name: 'Recent activity' })
    expect(within(recent).getAllByRole('listitem')).toHaveLength(10)
    expect(within(recent).getAllByText('Access requested').length).toBeGreaterThan(0)
    expect(await screen.findByLabelText('Groups in your vault')).toBeInTheDocument()
    expect(await screen.findByText('Audit log intact')).toBeInTheDocument()
    const before = callsTo(backend, 'GET', '/audit/verify').length
    await user.click(screen.getByRole('button', { name: 'Verify again' }))
    await waitFor(() =>
      expect(callsTo(backend, 'GET', '/audit/verify').length).toBeGreaterThan(before),
    )
  })

  it('flags a broken audit chain on the front page', async () => {
    const backend = createMockBackend()
    backend.tamperAudit('edit-entry', 5)
    await openDashboard({ backend })
    expect(await screen.findByText('Audit log broken')).toBeInTheDocument()
    expect(screen.getByText(/Entry #5 was changed/)).toBeInTheDocument()
  })

  it('teaches a new owner what consent means and how to add the first attribute', async () => {
    await openDashboard({ seed: 'empty' })
    expect(
      await screen.findByRole('heading', { name: /Your data stays in your vault/ }),
    ).toBeInTheDocument()
    expect(screen.getByText('Put a fact in your vault')).toBeInTheDocument()
    expect(screen.getByText(/Nothing is waiting for your decision/)).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Add your first attribute' })).toHaveAttribute(
      'href',
      '/vault?add=1',
    )
    expect(screen.queryByRole('region', { name: 'Waiting for your decision' })).toBeNull()
  })

  it('opens the add dialog when sent from the first-run page', async () => {
    const { user } = await openDashboard({ seed: 'empty' })
    await user.click(await screen.findByRole('link', { name: 'Add your first attribute' }))
    expect(await screen.findByRole('dialog')).toBeInTheDocument()
  })

  it('shows calm empty states once the vault has something but nobody has access', async () => {
    const backend = createMockBackend({ seed: 'empty' })
    await backend.fetch('/api/v1/owner/vault/attributes', {
      method: 'POST',
      headers: { authorization: 'Bearer t', 'content-type': 'application/json' },
      body: JSON.stringify({ keyPath: 'profile.name', value: 'Sam', sensitivity: 'PERSONAL' }),
    })
    await openDashboard({ backend })
    expect(await screen.findByRole('heading', { name: 'No app has access' })).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: /Your data stays in your vault/ })).toBeNull()
    expect(await screen.findByLabelText('Groups in your vault')).toBeInTheDocument()
  })

  it('updates the pending count and nav badge when an app asks for access', async () => {
    const { user } = await openDashboard()
    await user.click(screen.getByRole('button', { name: 'Simulate an access request' }))
    await waitFor(async () =>
      expect(within(await stat('Waiting for you')).getByText('3')).toBeInTheDocument(),
    )
    expect(await screen.findByRole('link', { name: /Requests\s*3 pending/ })).toBeInTheDocument()
  })

  it('shows an error with retry when the dashboard cannot load', async () => {
    const backend = createMockBackend()
    backend.failNext(/GET \/v1\/owner\/dashboard/, 500, 'boom')
    const { user } = await openDashboard({ backend })
    expect(await screen.findByRole('alert')).toHaveTextContent('The gateway had a problem')
    await user.click(screen.getByRole('button', { name: 'Try again' }))
    expect(await stat('Waiting for you')).toBeInTheDocument()
  })
})
