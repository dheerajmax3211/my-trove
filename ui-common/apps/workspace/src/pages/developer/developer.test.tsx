import { screen, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { renderDemo } from '../../testing/harness'

describe('developer area', () => {
  it('opens for a developer: its own usage, the permissions it holds, and Phase 3 labelled honestly', async () => {
    renderDemo('DEVELOPER', { path: '/developer' })
    expect(await screen.findByRole('heading', { level: 1, name: 'Developer' })).toBeInTheDocument()

    const held = screen.getByRole('list', { name: 'Developer permissions you hold' })
    expect(within(held).getByText('apps:manage')).toBeInTheDocument()
    expect(within(held).queryByText('plans:manage')).not.toBeInTheDocument()

    expect(screen.getAllByText('Phase 3, not built yet')).toHaveLength(2)
    expect(screen.getByText(/Until then there is no key to create here/)).toBeInTheDocument()
    // Nothing on the page is a control that does nothing.
    expect(screen.queryByRole('button', { name: /create a key/i })).not.toBeInTheDocument()
  })

  it('is open to the owner, who holds every developer permission', async () => {
    renderDemo('OWNER', { path: '/developer' })
    expect(await screen.findByRole('heading', { level: 1, name: 'Developer' })).toBeInTheDocument()
    expect(screen.getByRole('list', { name: 'Developer permissions you hold' })).toBeInTheDocument()
  })

  it('shows a clear reason and the missing permissions to a member, instead of the page', async () => {
    renderDemo('MEMBER', { path: '/developer' })
    const forbidden = await screen.findByTestId('forbidden')
    expect(
      within(forbidden).getByRole('heading', { name: 'Developer is not part of your role' }),
    ).toBeInTheDocument()
    expect(within(forbidden).getByText('apps:manage')).toBeInTheDocument()
    expect(
      screen.queryByRole('list', { name: 'Developer permissions you hold' }),
    ).not.toBeInTheDocument()
  })
})
