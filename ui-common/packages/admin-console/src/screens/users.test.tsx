import { screen, waitFor, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { callsTo, jsonResponse, problem, renderAdmin } from '../testing/harness'

describe('Users list', () => {
  it('lists the first page with roles as badges, plan and status', async () => {
    const { requests } = renderAdmin({ route: '/users' })
    const table = await screen.findByRole('table', { name: 'Users' })
    await within(table).findByText('Isabel Costa')
    expect(within(table).getAllByRole('row')).toHaveLength(21) // header + 20
    expect(screen.getByText('Showing 1 to 20 of 24, page 1 of 2')).toBeInTheDocument()
    expect(callsTo(requests, 'GET', '/v1/admin/users')[0]?.search.get('size')).toBe('20')

    const mei = (await screen.findByRole('link', { name: 'Mei Tanaka' })).closest(
      'tr',
    ) as HTMLElement
    expect(within(mei).getByText('Developer')).toBeInTheDocument()
    expect(within(mei).getByText('Member')).toBeInTheDocument()
    expect(within(mei).getByText('PRO')).toBeInTheDocument() // plan
    expect(within(mei).getByText('Active')).toBeInTheDocument()
  })

  it('shows suspended people as suspended', async () => {
    renderAdmin({ route: '/users?q=luca' })
    const row = (await screen.findByRole('link', { name: 'Luca Ferrari' })).closest(
      'tr',
    ) as HTMLElement
    expect(within(row).getByText('Suspended')).toBeInTheDocument()
  })

  it('searches as you type and keeps the query in the URL', async () => {
    const { user, requests } = renderAdmin({ route: '/users' })
    await screen.findByText('Isabel Costa')
    await user.type(screen.getByRole('searchbox', { name: 'Search users' }), 'priya')
    await waitFor(() =>
      expect(
        callsTo(requests, 'GET', '/v1/admin/users').some((r) => r.search.get('q') === 'priya'),
      ).toBe(true),
    )
    await waitFor(() => expect(screen.queryByText('Isabel Costa')).not.toBeInTheDocument())
    expect(screen.getByRole('link', { name: 'Priya Raman' })).toBeInTheDocument()
    expect(screen.getByTestId('where')).toHaveTextContent('/app/admin/users?q=priya')
    expect(screen.getByText('Showing 1 to 1 of 1')).toBeInTheDocument()
  })

  it('starts from ?q= in the link', async () => {
    const { requests } = renderAdmin({ route: '/users?q=hannah' })
    await screen.findByRole('link', { name: 'Hannah Lindqvist' })
    expect(callsTo(requests, 'GET', '/v1/admin/users')[0]?.search.get('q')).toBe('hannah')
    expect(screen.getByRole('searchbox', { name: 'Search users' })).toHaveValue('hannah')
  })

  it('pages forwards and back', async () => {
    const { user, requests } = renderAdmin({ route: '/users' })
    await screen.findByText('Isabel Costa')
    await user.click(screen.getByRole('button', { name: 'Next' }))
    await screen.findByText('Showing 21 to 24 of 24, page 2 of 2')
    expect(
      callsTo(requests, 'GET', '/v1/admin/users').some((r) => r.search.get('page') === '1'),
    ).toBe(true)
    expect(screen.getByRole('button', { name: 'Next' })).toBeDisabled()
    await user.click(screen.getByRole('button', { name: 'Previous' }))
    await screen.findByText('Showing 1 to 20 of 24, page 1 of 2')
  })

  it('explains an empty search and offers to clear it', async () => {
    const { user } = renderAdmin({ route: '/users?q=zzzz' })
    expect(
      await screen.findByRole('heading', { name: 'No one matches "zzzz"' }),
    ).toBeInTheDocument()
    await user.click(screen.getAllByRole('button', { name: 'Clear search' })[0] as HTMLElement)
    await screen.findByText('Isabel Costa')
  })

  it('opens a person from the Manage button under the module base', async () => {
    renderAdmin({ route: '/users?q=sam' })
    const manage = await screen.findByRole('link', { name: 'Manage Sam Okafor' })
    expect(manage.getAttribute('href')).toMatch(
      /^\/app\/admin\/users\/0190d2a4-7a3e-7c1b-9f2e-0000000000/,
    )
  })

  it('a 403 from the API is shown as not allowed, not as a broken page', async () => {
    renderAdmin({
      route: '/users',
      intercept: (r) => (r.path === '/v1/admin/users' ? problem(403, 'Access Denied') : undefined),
    })
    expect(
      await screen.findByRole('heading', { name: 'The platform did not allow this' }),
    ).toBeInTheDocument()
    expect(screen.getByText(/Access Denied/)).toBeInTheDocument()
  })

  it('a network failure offers a retry that works', async () => {
    let fail = true
    const { user } = renderAdmin({
      route: '/users',
      intercept: (r) =>
        r.path === '/v1/admin/users' && fail
          ? Promise.reject(new TypeError('Failed to fetch'))
          : undefined,
    })
    expect(await screen.findByText("Can't reach the platform")).toBeInTheDocument()
    fail = false
    await user.click(screen.getByRole('button', { name: 'Try again' }))
    await screen.findByText('Isabel Costa')
  })

  it('a server error shows the server message', async () => {
    renderAdmin({
      route: '/users',
      intercept: (r) =>
        r.path === '/v1/admin/users' ? problem(500, 'Database is down') : undefined,
    })
    expect(await screen.findByText('Could not load users')).toBeInTheDocument()
    expect(screen.getByText('Database is down')).toBeInTheDocument()
  })

  it('shows a first-run empty state when nobody has signed in', async () => {
    renderAdmin({
      route: '/users',
      intercept: (r) =>
        r.path === '/v1/admin/users'
          ? jsonResponse({ items: [], page: 0, size: 20, total: 0 })
          : undefined,
    })
    expect(await screen.findByRole('heading', { name: 'No users yet' })).toBeInTheDocument()
  })
})
