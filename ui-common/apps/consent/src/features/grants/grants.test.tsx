import { screen, waitFor, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { createMockBackend } from '../../mock/backend'
import { paths } from '../../shared/api/paths'
import { callsTo, dialog, pageHeading, renderApp } from '../../test/utils'

async function openGrants(options: Parameters<typeof renderApp>[0] = {}) {
  const app = renderApp({ route: '/grants', ...options })
  await pageHeading('Grants')
  return app
}

describe('grants', () => {
  it('lists active grants with scopes, purpose, expiry and reads used of the maximum', async () => {
    await openGrants()
    const list = await screen.findByRole('list', { name: 'Active grants' })
    const item = within(list)
    expect(item.getByText('Stride Shoes')).toBeInTheDocument()
    expect(item.getByText('profile.sizes:read')).toBeInTheDocument()
    expect(item.getByText('Recommend shoes that fit')).toBeInTheDocument()
    expect(item.getByText('3 of 100 reads')).toBeInTheDocument()
    expect(item.getByText(/Expires|Expires/)).toBeInTheDocument()
  })

  it('shows an empty state when nobody has access', async () => {
    await openGrants({ seed: 'empty' })
    expect(
      await screen.findByRole('heading', { name: 'No app has access right now' }),
    ).toBeInTheDocument()
  })

  it('revokes only after confirmation, immediately, and keeps the grant in the full list as revoked', async () => {
    const { user, backend } = await openGrants()
    await user.click(await screen.findByRole('button', { name: 'Revoke access for Stride Shoes' }))
    expect(
      screen.getByRole('dialog', { name: 'Revoke access for Stride Shoes?' }),
    ).toBeInTheDocument()
    await user.click(dialog().getByRole('button', { name: 'Cancel' }))
    expect(callsTo(backend, 'POST', '/revoke')).toHaveLength(0)

    await user.click(screen.getByRole('button', { name: 'Revoke access for Stride Shoes' }))
    await user.click(dialog().getByRole('button', { name: 'Revoke access' }))
    expect(await screen.findByText('Access revoked')).toBeInTheDocument()
    expect(callsTo(backend, 'POST', '/revoke')).toHaveLength(1)
    expect(callsTo(backend, 'POST', '/revoke')[0]?.body).toBeUndefined()
    expect(
      await screen.findByRole('heading', { name: 'No app has access right now' }),
    ).toBeInTheDocument()

    await user.click(screen.getByRole('tab', { name: 'All, including ended' }))
    const all = await screen.findByRole('list', { name: 'All grants' })
    expect(within(all).getByText('Revoked', { selector: 'span' })).toBeInTheDocument()
    expect(within(all).queryByRole('button', { name: /Revoke access/ })).not.toBeInTheDocument()
  })

  it('a revoked grant is refused on the next read and the refusal shows in the history', async () => {
    const { user, backend, runtime } = await openGrants()
    const [grant] = await runtime.apiClient.get<{ id: string }[]>(paths.grants)
    await user.click(await screen.findByRole('button', { name: 'Revoke access for Stride Shoes' }))
    await user.click(dialog().getByRole('button', { name: 'Revoke access' }))
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())

    expect(backend.simulateRead(grant?.id).eventType).toBe('DATA_DENIED')
    await user.click(screen.getByRole('link', { name: 'History' }))
    await pageHeading('Access history')
    const table = await screen.findByRole('table', { name: 'Access history' })
    expect(within(table).getByText('Refused: grant was revoked')).toBeInTheDocument()
    expect(within(table).getByText('Access revoked')).toBeInTheDocument()
  })

  it('keeps the dialog open and explains when the revoke fails', async () => {
    const backend = createMockBackend()
    const { user } = await openGrants({ backend })
    backend.failNext(/POST .*\/revoke/, 500, 'boom')
    await user.click(await screen.findByRole('button', { name: 'Revoke access for Stride Shoes' }))
    await user.click(dialog().getByRole('button', { name: 'Revoke access' }))
    expect(await dialog().findByText(/This is not your fault/)).toBeInTheDocument()
    expect(screen.getByRole('dialog')).toBeInTheDocument()
  })

  it('shows an error with retry when grants cannot load', async () => {
    const backend = createMockBackend()
    backend.failNext(/GET \/v1\/owner\/grants/, 500, 'boom')
    const { user } = await openGrants({ backend })
    expect(await screen.findByRole('alert')).toHaveTextContent('The gateway had a problem')
    await user.click(screen.getByRole('button', { name: 'Try again' }))
    expect(await screen.findByRole('list', { name: 'Active grants' })).toBeInTheDocument()
  })
})
