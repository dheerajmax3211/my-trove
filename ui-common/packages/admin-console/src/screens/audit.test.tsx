import { screen, waitFor, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { demoId } from '../demo/seed'
import { callsTo, jsonResponse, problem, renderAdmin } from '../testing/harness'

const HANNAH = demoId(6)

describe('Audit log', () => {
  it('lists entries with actor and target names, the action and its detail', async () => {
    renderAdmin({ persona: 'AUDITOR', route: '/audit' })
    const table = await screen.findByRole('table', { name: 'Audit log' })
    await within(table).findAllByText('Maya Ortiz')
    expect(within(table).getAllByRole('row')).toHaveLength(9) // header + 8 seeded entries
    const rows = within(table).getAllByRole('row').slice(1)
    const first = rows[0] as HTMLElement // newest first
    expect(within(first).getByText('Plan changed')).toBeInTheDocument()
    expect(within(first).getByText('FREE to PRO')).toBeInTheDocument()
    expect(within(first).getByRole('link', { name: 'Maya Ortiz' })).toHaveAttribute(
      'href',
      `/app/admin/users/${demoId(1)}`,
    )
    expect(within(first).getByRole('link', { name: 'Hannah Lindqvist' })).toBeInTheDocument()
    expect(within(table).getByText('User suspended')).toBeInTheDocument()
    expect(within(table).getAllByText('Role granted').length).toBeGreaterThan(0)
    expect(within(table).getAllByText('Role DEVELOPER').length).toBeGreaterThan(0)
  })

  it('looks names up in one batch for the whole page', async () => {
    const { requests } = renderAdmin({ route: '/audit' })
    await screen.findAllByText('Maya Ortiz')
    const lookups = callsTo(requests, 'GET', '/v1/admin/users/lookup')
    expect(lookups).toHaveLength(1)
    const ids = (lookups[0]?.search.get('ids') ?? '').split(',')
    expect(ids.length).toBe(new Set(ids).size)
    expect(ids.length).toBeLessThanOrEqual(100)
  })

  it('filters by target id and clears the filter', async () => {
    const { user, requests } = renderAdmin({ route: '/audit' })
    await screen.findAllByText('Maya Ortiz')
    await user.type(screen.getByRole('textbox', { name: 'Filter by user id' }), HANNAH)
    await user.click(screen.getByRole('button', { name: 'Apply filter' }))
    await waitFor(() =>
      expect(callsTo(requests, 'GET', '/v1/admin/audit').some((r) => r.search.get('targetId') === HANNAH)).toBe(true),
    )
    await waitFor(() => expect(screen.getAllByRole('row')).toHaveLength(2)) // header + her one change
    expect(await screen.findByText(/Showing changes to/)).toHaveTextContent('Hannah Lindqvist')
    expect(screen.getByTestId('where')).toHaveTextContent(`target=${HANNAH}`)

    await user.click(screen.getByRole('button', { name: 'Clear filter' }))
    await waitFor(() => expect(screen.getAllByRole('row')).toHaveLength(9))
    expect(screen.queryByText(/Showing changes to/)).not.toBeInTheDocument()
  })

  it('rejects an id that is not an id without asking the server', async () => {
    const { user, requests } = renderAdmin({ route: '/audit' })
    await screen.findAllByText('Maya Ortiz')
    const before = requests.length
    await user.type(screen.getByRole('textbox', { name: 'Filter by user id' }), 'hannah')
    await user.click(screen.getByRole('button', { name: 'Apply filter' }))
    expect(await screen.findByText(/Enter a full user id/)).toBeInTheDocument()
    expect(screen.getByRole('textbox', { name: 'Filter by user id' })).toBeInvalid()
    expect(requests.length).toBe(before)
  })

  it('opens already filtered from the link on a user page', async () => {
    const { requests } = renderAdmin({ route: `/audit?target=${HANNAH}` })
    await screen.findByText(/Showing changes to/)
    expect(callsTo(requests, 'GET', '/v1/admin/audit')[0]?.search.get('targetId')).toBe(HANNAH)
    expect(screen.getByRole('textbox', { name: 'Filter by user id' })).toHaveValue(HANNAH)
  })

  it('says so when a user has no recorded changes', async () => {
    renderAdmin({ route: `/audit?target=${demoId(22)}` })
    expect(await screen.findByRole('heading', { name: 'No recorded changes for this user' })).toBeInTheDocument()
  })

  it('pages through a long log', async () => {
    const entry = (n: number) => ({
      id: `0190d2a4-aaaa-7c1b-9f2e-${String(n).padStart(12, '0')}`,
      at: '2026-11-20T10:00:00Z',
      actorId: demoId(1),
      action: 'ROLE_GRANTED',
      targetId: demoId(6),
      detail: { role: 'DEVELOPER' },
    })
    const { user, requests } = renderAdmin({
      route: '/audit',
      intercept: (r) => {
        if (r.path !== '/v1/admin/audit') return undefined
        const page = Number(r.search.get('page') ?? 0)
        const count = page === 2 ? 5 : 20
        return jsonResponse({
          items: Array.from({ length: count }, (_, i) => entry(page * 20 + i)),
          page,
          size: 20,
          total: 45,
        })
      },
    })
    await screen.findByText('Showing 1 to 20 of 45, page 1 of 3')
    await user.click(screen.getByRole('button', { name: 'Next' }))
    await screen.findByText('Showing 21 to 40 of 45, page 2 of 3')
    await user.click(screen.getByRole('button', { name: 'Next' }))
    await screen.findByText('Showing 41 to 45 of 45, page 3 of 3')
    expect(screen.getByRole('button', { name: 'Next' })).toBeDisabled()
    expect(callsTo(requests, 'GET', '/v1/admin/audit').map((r) => r.search.get('page'))).toEqual(
      expect.arrayContaining(['0', '1', '2']),
    )
  })

  it('shows system actions as System and handles unknown actions', async () => {
    renderAdmin({
      route: '/audit',
      intercept: (r) =>
        r.path === '/v1/admin/audit'
          ? jsonResponse({
              items: [
                { id: 'a', at: '2026-11-20T10:00:00Z', actorId: null, action: 'SOMETHING_NEW', targetId: null, detail: { why: 'test' } },
              ],
              page: 0,
              size: 20,
              total: 1,
            })
          : undefined,
    })
    expect(await screen.findByText('System')).toBeInTheDocument()
    expect(screen.getByText('SOMETHING_NEW')).toBeInTheDocument()
    expect(screen.getByText('why: test')).toBeInTheDocument()
    expect(screen.getByText('None')).toBeInTheDocument()
  })

  it('403 and network errors are handled', async () => {
    const first = renderAdmin({ route: '/audit', intercept: (r) => (r.path === '/v1/admin/audit' ? problem(403, 'Access Denied') : undefined) })
    expect(await screen.findByRole('heading', { name: 'The platform did not allow this' })).toBeInTheDocument()
    first.unmount()
    renderAdmin({ route: '/audit', intercept: (r) => (r.path === '/v1/admin/audit' ? Promise.reject(new TypeError('x')) : undefined) })
    expect(await screen.findByText("Can't reach the platform")).toBeInTheDocument()
  })
})
