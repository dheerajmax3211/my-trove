import { describe, expect, it } from 'vitest'
import { apiFor } from '../../test/fixtures'
import { renderApp, screen, within } from '../../test/renderApp'

const row = (text: string) => screen.getByRole('cell', { name: text }).closest('tr') as HTMLElement

describe('activity and reversals', () => {
  it('lists entries newest first with who, what and how much', async () => {
    renderApp({ path: 'activity' })
    expect(await screen.findByRole('heading', { level: 1, name: 'Activity' })).toBeInTheDocument()
    await screen.findByRole('table', { name: 'Ledger entries' })
    const rows = screen.getAllByRole('row').slice(1)
    expect(within(rows[0]!).getByText('Garage sale proceeds')).toBeInTheDocument()
    expect(within(rows[0]!).getByText('$300.00')).toBeInTheDocument()
    expect(within(rows[0]!).getByText('Maya Okafor')).toBeInTheDocument()
    expect(within(row('Zoo tickets')).getByText('Split')).toBeInTheDocument()
  })

  it('confirms a reversal, explains the mirrored entry, and then balances return', async () => {
    const { user, backend, householdId } = renderApp({ path: 'activity' })
    await user.click(await screen.findByRole('button', { name: 'Reverse Garage sale proceeds' }))

    const dialog = await screen.findByRole('dialog', { name: /reverse this entry/i })
    expect(within(dialog).getByText(/never edited or deleted/i)).toBeInTheDocument()
    const mirror = within(dialog).getByRole('table', { name: 'What will be mirrored' })
    expect(within(mirror).getByText('Household pool')).toBeInTheDocument()
    // Pool and deposits income: each amount appears once as it is now and once mirrored.
    expect(within(mirror).getAllByText('+$300.00')).toHaveLength(2)
    expect(within(mirror).getAllByText('-$300.00')).toHaveLength(2)
    expect(within(dialog).getByText(/both entries stay in the history/i)).toBeInTheDocument()
    // Nothing happens until confirmed.
    expect(backend.requests.filter((r) => r.path.endsWith('/reverse'))).toHaveLength(0)

    await user.type(within(dialog).getByLabelText(/reason/i), 'Counted twice')
    await user.click(within(dialog).getByRole('button', { name: 'Reverse entry' }))

    expect(await screen.findByText('Reversal recorded')).toBeInTheDocument()
    expect(backend.balanceOf(householdId, 'POOL')).toBe(217_030 - 30_000)
    const entries = await apiFor(backend, 'u-maya').listEntries(householdId, 0, 2)
    expect(entries[0]).toMatchObject({
      kind: 'REVERSAL',
      description: 'Reversal of: Garage sale proceeds (Counted twice)',
    })
    expect(entries[0]!.reversesEntryId).toBe(entries[1]!.id)

    const original = row('Garage sale proceeds')
    expect(within(original).getByText('Reversed')).toBeInTheDocument()
    expect(within(original).queryByRole('button', { name: /reverse/i })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /^Reverse Reversal of/ })).not.toBeInTheDocument()
  })

  it('does nothing when the confirmation is cancelled', async () => {
    const { user, backend } = renderApp({ path: 'activity' })
    await user.click(await screen.findByRole('button', { name: 'Reverse Garage sale proceeds' }))
    await user.click(
      within(await screen.findByRole('dialog')).getByRole('button', { name: 'Cancel' }),
    )
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(backend.requests.filter((r) => r.path.endsWith('/reverse'))).toHaveLength(0)
  })

  it('posts one reversal when the confirm button is double-clicked', async () => {
    const { user, backend, householdId } = renderApp({ path: 'activity' })
    await user.click(await screen.findByRole('button', { name: 'Reverse Garage sale proceeds' }))
    await user.dblClick(
      within(await screen.findByRole('dialog')).getByRole('button', { name: 'Reverse entry' }),
    )
    await screen.findByText('Reversal recorded')
    expect(backend.requests.filter((r) => r.path.endsWith('/reverse'))).toHaveLength(1)
    expect(backend.balanceOf(householdId, 'POOL')).toBe(217_030 - 30_000)
  })

  it('tells you plainly when the entry was already reversed elsewhere (409)', async () => {
    const { user, backend, householdId } = renderApp({ path: 'activity' })
    const button = await screen.findByRole('button', { name: 'Reverse Garage sale proceeds' })
    const api = apiFor(backend, 'u-dev')
    const entry = (await api.listEntries(householdId, 0, 1))[0]!
    await api.reverse(householdId, entry.id, null, 'someone-else')

    await user.click(button)
    await user.click(
      within(await screen.findByRole('dialog')).getByRole('button', { name: 'Reverse entry' }),
    )
    expect(await screen.findByText(/already been reversed/i)).toBeInTheDocument()
    expect(screen.getByRole('dialog')).toBeInTheDocument()
  })

  it('explains when a reversal would overdraw an account', async () => {
    const { user, backend, householdId } = renderApp({ path: 'activity' })
    await user.click(
      await screen.findByRole('button', { name: 'Reverse October household contributions' }),
    )
    const dialog = await screen.findByRole('dialog', { name: /reverse this entry/i })
    await user.click(within(dialog).getByRole('button', { name: 'Reverse entry' }))
    expect(await within(dialog).findByText(/not enough money/i)).toBeInTheDocument()
    expect(backend.balanceOf(householdId, 'POOL')).toBe(217_030)
  })

  it('hides reversal from members, who can still read the log', async () => {
    renderApp({ uid: 'u-sam', path: 'activity' })
    await screen.findByRole('table', { name: 'Ledger entries' })
    expect(screen.queryByRole('button', { name: /^Reverse/ })).not.toBeInTheDocument()
    expect(screen.queryByRole('columnheader', { name: 'Actions' })).not.toBeInTheDocument()
  })

  it('pages through older entries', async () => {
    const { user } = renderApp({
      path: 'activity',
      prepare: (backend, id) => {
        const h = backend.household(id)
        for (let i = 0; i < 12; i += 1) {
          backend.post(h, 'DEPOSIT', `Bulk ${String(i).padStart(2, '0')}`, 'u-maya', [
            { code: 'POOL', amount: 100 },
            { code: 'INCOME:DEPOSITS', amount: -100 },
          ])
        }
      },
    })
    await screen.findByText('Bulk 11')
    expect(screen.getByRole('button', { name: 'Newer' })).toBeDisabled()
    await user.click(screen.getByRole('button', { name: 'Older' }))
    expect(await screen.findByText('Page 2')).toBeInTheDocument()
    expect(screen.queryByText('Bulk 11')).not.toBeInTheDocument()
    expect(screen.getByText('October household contributions')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Newer' }))
    expect(await screen.findByText('Bulk 11')).toBeInTheDocument()
  })

  it('has an empty state with a next step in a brand new household', async () => {
    const { user, backend } = renderApp({ uid: 'u-ada', path: '/welcome', seed: false })
    await user.type(await screen.findByLabelText(/household name/i), 'Fresh start')
    await user.click(screen.getByRole('button', { name: 'Create household' }))
    await screen.findByRole('heading', { level: 1, name: 'Fresh start' })
    await user.click(screen.getByRole('link', { name: 'Activity' }))
    expect(await screen.findByText('No activity yet')).toBeInTheDocument()
    expect(
      within(screen.getByRole('main')).getByRole('link', { name: 'Move money' }),
    ).toBeInTheDocument()
    expect(backend.households).toHaveLength(1)
  })
})
