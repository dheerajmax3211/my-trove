import { screen, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { callsTo, renderAdmin } from '../testing/harness'

describe('Overview', () => {
  it('shows an owner who they are, the headline numbers and a link to every screen', async () => {
    renderAdmin({ persona: 'OWNER' })
    const you = await screen.findByRole('region', { name: 'You' })
    expect(within(you).getByText('Maya Ortiz')).toBeInTheDocument()
    expect(within(you).getByText('Owner')).toBeInTheDocument()
    const headline = await screen.findByRole('region', { name: 'The last 24 hours' })
    for (const label of ['Requests', 'Error rate', 'Latency, p95', 'Active users'])
      expect(await within(headline).findByRole('group', { name: label })).toBeInTheDocument()
    const nav = screen.getByRole('navigation', { name: 'Admin screens' })
    expect(
      within(nav)
        .getAllByRole('link')
        .map((a) => a.textContent),
    ).toEqual([
      expect.stringContaining('Users'),
      expect.stringContaining('Roles'),
      expect.stringContaining('Usage'),
      expect.stringContaining('Audit'),
      expect.stringContaining('Flags'),
      expect.stringContaining('Plans'),
    ])
    expect(within(nav).getByRole('link', { name: /Users/ })).toHaveAttribute(
      'href',
      '/app/admin/users',
    )
  })

  it('an auditor sees read links only: no flags', async () => {
    renderAdmin({ persona: 'AUDITOR' })
    const nav = await screen.findByRole('navigation', { name: 'Admin screens' })
    expect(within(nav).queryByRole('link', { name: /Flags/ })).not.toBeInTheDocument()
    expect(within(nav).getByRole('link', { name: /Audit/ })).toBeInTheDocument()
    expect(within(nav).getByRole('link', { name: /Usage/ })).toBeInTheDocument()
  })

  it('a member gets a teaching empty state, their own usage and no admin requests', async () => {
    const { requests } = renderAdmin({ persona: 'MEMBER' })
    expect(
      await screen.findByRole('heading', { name: 'There is nothing to administer with your role' }),
    ).toBeInTheDocument()
    expect(screen.queryByRole('navigation', { name: 'Admin screens' })).not.toBeInTheDocument()
    expect(await screen.findByRole('heading', { name: 'Your usage' })).toBeInTheDocument()
    expect(requests.every((r) => r.path.startsWith('/v1/usage/me'))).toBe(true)
    expect(callsTo(requests, 'GET', '/v1/usage/summary')).toHaveLength(0)
  })

  it('a developer is told the same, and sees no usage numbers for others', async () => {
    renderAdmin({ persona: 'DEVELOPER' })
    expect(await screen.findByText(/nothing to administer/)).toBeInTheDocument()
    expect(screen.queryByRole('region', { name: 'The last 24 hours' })).not.toBeInTheDocument()
  })

  it('degrades when the headline numbers cannot load', async () => {
    renderAdmin({
      persona: 'OWNER',
      intercept: (r) =>
        r.path === '/v1/usage/summary'
          ? new Response(
              JSON.stringify({ title: 'Boom', status: 500, detail: 'Database is down' }),
              {
                status: 500,
                headers: { 'content-type': 'application/problem+json' },
              },
            )
          : undefined,
    })
    expect(await screen.findByText('Database is down')).toBeInTheDocument()
    // the rest of the page still works
    expect(screen.getByRole('navigation', { name: 'Admin screens' })).toBeInTheDocument()
  })
})
