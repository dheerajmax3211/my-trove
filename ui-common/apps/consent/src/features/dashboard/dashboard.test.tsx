import { screen, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { createMockBackend } from '../../mock/backend'
import { pageHeading, renderApp } from '../../test/utils'

async function openDashboard(options: Parameters<typeof renderApp>[0] = {}) {
  const app = renderApp(options)
  await pageHeading('Overview')
  return app
}

describe('dashboard', () => {
  it('summarises pending requests, who has access, recent activity and chain health', async () => {
    await openDashboard()
    expect(await screen.findByLabelText('2 pending requests')).toBeInTheDocument()
    const grants = await screen.findByRole('list', { name: 'Active grants' })
    expect(within(grants).getByText('Stride Shoes')).toBeInTheDocument()
    expect(within(grants).getByText('profile.sizes:read')).toBeInTheDocument()
    expect(within(grants).getByText('3 of 100 reads')).toBeInTheDocument()
    const recent = await screen.findByRole('list', { name: 'Recent activity' })
    expect(within(recent).getAllByRole('listitem')).toHaveLength(10)
    expect(within(recent).getAllByText('Access requested').length).toBeGreaterThan(0)
    expect(await screen.findByText('Audit log intact')).toBeInTheDocument()
  })

  it('flags a broken audit chain on the front page', async () => {
    const backend = createMockBackend()
    backend.tamperAudit('edit-entry', 5)
    await openDashboard({ backend })
    expect(await screen.findByText('Audit log broken')).toBeInTheDocument()
    expect(screen.getByText(/Entry #5 was changed/)).toBeInTheDocument()
  })

  it('shows calm empty states for a new owner', async () => {
    await openDashboard({ seed: 'empty' })
    expect(await screen.findByLabelText('0 pending requests')).toBeInTheDocument()
    expect(await screen.findByRole('heading', { name: 'No app has access' })).toBeInTheDocument()
    expect(await screen.findByRole('heading', { name: 'No activity yet' })).toBeInTheDocument()
  })

  it('updates the pending count and nav badge when an app asks for access', async () => {
    const { user } = await openDashboard()
    await user.click(screen.getByRole('button', { name: 'Simulate an access request' }))
    expect(await screen.findByLabelText('3 pending requests')).toBeInTheDocument()
    expect(await screen.findByRole('link', { name: /Requests\s*3 pending/ })).toBeInTheDocument()
  })

  it('shows an error with retry when the dashboard cannot load', async () => {
    const backend = createMockBackend()
    backend.failNext(/GET \/v1\/owner\/dashboard/, 500, 'boom')
    const { user } = await openDashboard({ backend })
    expect(await screen.findByRole('alert')).toHaveTextContent('The gateway had a problem')
    await user.click(screen.getByRole('button', { name: 'Try again' }))
    expect(await screen.findByLabelText('2 pending requests')).toBeInTheDocument()
  })
})
