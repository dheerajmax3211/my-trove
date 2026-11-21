import { screen, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { problem, renderAdmin } from '../testing/harness'

describe('Roles', () => {
  it('shows each persona with its description and a permission matrix grouped by area', async () => {
    renderAdmin({ route: '/roles' })
    const personas = await screen.findByRole('list', { name: 'Roles and what they are for' })
    expect(
      within(personas).getByText(
        /Operator and support: manages users and roles, but cannot grant ADMIN or OWNER/,
      ),
    ).toBeInTheDocument()
    const matrix = screen.getByRole('table')
    for (const role of ['OWNER', 'ADMIN', 'DEVELOPER', 'AUDITOR', 'MEMBER'])
      expect(within(matrix).getByRole('columnheader', { name: role })).toBeInTheDocument()
    for (const area of ['Products', 'Usage', 'People', 'Platform', 'Developer'])
      expect(within(matrix).getByRole('rowheader', { name: area })).toBeInTheDocument()
  })

  it('says who holds what, in words as well as marks', async () => {
    renderAdmin({ route: '/roles' })
    await screen.findByRole('table')
    expect(screen.getByText('OWNER has roles:assign:privileged')).toBeInTheDocument()
    expect(screen.getByText('ADMIN does not have roles:assign:privileged')).toBeInTheDocument()
    expect(screen.getByText('AUDITOR has audit:read')).toBeInTheDocument()
    expect(screen.getByText('MEMBER does not have flags:manage')).toBeInTheDocument()
    expect(screen.getByText('ADMIN has flags:manage')).toBeInTheDocument()
  })

  it('puts the matrix in a keyboard-focusable scroll region', async () => {
    renderAdmin({ route: '/roles' })
    const region = await screen.findByRole('region', { name: 'Permissions by role' })
    expect(region).toHaveAttribute('tabindex', '0')
  })

  it('handles a 403 and a network failure', async () => {
    renderAdmin({ route: '/roles', intercept: () => problem(403, 'Access Denied') })
    expect(
      await screen.findByRole('heading', { name: 'The platform did not allow this' }),
    ).toBeInTheDocument()
  })

  it('network error', async () => {
    renderAdmin({ route: '/roles', intercept: () => Promise.reject(new TypeError('offline')) })
    expect(await screen.findByText("Can't reach the platform")).toBeInTheDocument()
  })
})

describe('Plans', () => {
  it('shows the three plans with the real limits and says billing is simulated', async () => {
    renderAdmin({ route: '/plans', persona: 'AUDITOR' })
    const table = await screen.findByRole('table', { name: 'Plans and their limits' })
    const rows = within(table).getAllByRole('row').slice(1)
    expect(rows).toHaveLength(3)
    const text = rows.map((r) => r.textContent ?? '')
    expect(text[0]).toContain('FREE')
    expect(text[0]).toContain('120')
    expect(text[0]).toContain('10,000')
    expect(text[1]).toContain('PRO')
    expect(text[1]).toContain('600')
    expect(text[1]).toContain('200,000')
    expect(text[2]).toContain('DEVELOPER')
    expect(text[2]).toContain('1,200')
    expect(text[2]).toContain('1,000,000')
    expect(screen.getByRole('note')).toHaveTextContent('Billing is simulated')
    expect(screen.getByRole('note')).toHaveTextContent('does not charge anyone')
  })

  it('makes no request: the table is fixed data', async () => {
    const { requests } = renderAdmin({ route: '/plans' })
    await screen.findByRole('table')
    expect(requests).toHaveLength(0)
  })
})
