import { fireEvent } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { apiFor } from '../../test/fixtures'
import { findField, getField, renderApp, screen, within } from '../../test/renderApp'

const scheduleRow = (name: string) =>
  screen.getByRole('cell', { name }).closest('tr') as HTMLElement

describe('allowances', () => {
  it('lists schedules per kid with amount, frequency, next run and status', async () => {
    renderApp({ path: 'allowances' })
    await screen.findByRole('table', { name: 'Allowance schedules' })
    const ada = scheduleRow('Ada Okafor pot')
    expect(within(ada).getByText('$10.00')).toBeInTheDocument()
    expect(within(ada).getByText('Weekly')).toBeInTheDocument()
    expect(within(ada).getByText('Nov 21, 2026')).toBeInTheDocument()
    expect(within(ada).getByText('Active')).toBeInTheDocument()
    const sam = scheduleRow('Sam Okafor pot')
    expect(within(sam).getByText('Monthly')).toBeInTheDocument()
    expect(within(sam).getByText('$25.00')).toBeInTheDocument()
  })

  it('shows run history including skipped periods and failed payments with the reason', async () => {
    const { user } = renderApp({ path: 'allowances' })
    await user.click(
      await screen.findByRole('button', { name: 'Run history for Weekly allowance for Ada' }),
    )
    const history = await screen.findByRole('table', {
      name: 'Run history for Weekly allowance for Ada',
    })
    const results = within(history)
      .getAllByRole('row')
      .slice(1)
      .map((r) => within(r).getAllByRole('cell')[1]!.textContent)
    expect(results).toEqual(['Paid', 'Skipped', 'Skipped', 'Paid'])
    expect(
      within(history).getAllByText(/only the latest is paid and earlier ones are never paid back/i),
    ).toHaveLength(2)

    await user.click(screen.getByRole('button', { name: 'Run history for Sam monthly allowance' }))
    const samHistory = await screen.findByRole('table', {
      name: 'Run history for Sam monthly allowance',
    })
    expect(within(samHistory).getByText('Failed')).toBeInTheDocument()
    expect(within(samHistory).getByText(/did not have enough/i)).toBeInTheDocument()
    expect(within(samHistory).getByText(/not retried/i)).toBeInTheDocument()
    // One history at a time.
    expect(
      screen.queryByRole('table', { name: 'Run history for Weekly allowance for Ada' }),
    ).not.toBeInTheDocument()
  })

  it('creates a schedule, validating on the client first', async () => {
    const { user, backend, householdId } = renderApp({ path: 'allowances' })
    await user.click(await screen.findByRole('button', { name: 'New allowance' }))
    const dialog = await screen.findByRole('dialog', { name: 'New allowance' })

    await user.click(within(dialog).getByRole('button', { name: 'Create allowance' }))
    expect(await within(dialog).findByText('Enter an amount.')).toBeInTheDocument()
    expect(within(dialog).getByText('Add a short description.')).toBeInTheDocument()

    await user.type(getField('Amount'), '7.50')
    fireEvent.change(getField('First payment on'), { target: { value: '2026-11-01' } })
    await user.type(getField('Description'), 'Chores money')
    await user.click(within(dialog).getByRole('button', { name: 'Create allowance' }))
    expect(await within(dialog).findByText(/start date cannot be in the past/i)).toBeInTheDocument()
    expect(
      backend.requests.filter(
        (r) => r.method === 'POST' && r.path.endsWith('/allowance-schedules'),
      ),
    ).toHaveLength(0)

    fireEvent.change(getField('First payment on'), { target: { value: '2026-11-25' } })
    await user.selectOptions(getField('How often'), 'Every month')
    await user.click(within(dialog).getByRole('button', { name: 'Create allowance' }))

    expect(await screen.findByText('Allowance scheduled')).toBeInTheDocument()
    const row = await screen.findByRole('cell', { name: 'Chores money' })
    expect(within(row.closest('tr')!).getByText('Monthly')).toBeInTheDocument()
    expect(within(row.closest('tr')!).getByText('Nov 25, 2026')).toBeInTheDocument()
    const created = (await apiFor(backend, 'u-maya').listSchedules(householdId)).at(-1)!
    expect(created).toMatchObject({
      amountMinor: 750,
      frequency: 'MONTHLY',
      startDate: '2026-11-25',
    })
  })

  it('pauses after a confirmation that says it cannot be resumed', async () => {
    const { user, backend, householdId } = renderApp({ path: 'allowances' })
    await user.click(await screen.findByRole('button', { name: 'Pause Weekly allowance for Ada' }))
    const dialog = await screen.findByRole('dialog', { name: 'Pause this allowance?' })
    expect(within(dialog).getByText(/create a new schedule/i)).toBeInTheDocument()
    await user.click(within(dialog).getByRole('button', { name: 'Pause allowance' }))

    expect(await screen.findByText('Allowance paused')).toBeInTheDocument()
    const row = scheduleRow('Ada Okafor pot')
    expect(await within(row).findByText('Paused')).toBeInTheDocument()
    expect(within(row).getByText('Not scheduled')).toBeInTheDocument()
    expect(within(row).queryByRole('button', { name: /^Pause/ })).not.toBeInTheDocument()
    const ada = (await apiFor(backend, 'u-maya').listSchedules(householdId)).find(
      (s) => s.description === 'Weekly allowance for Ada',
    )!
    expect(ada.active).toBe(false)
  })

  it('lets approvers look but not change; members and kids do not get the page', async () => {
    renderApp({ uid: 'u-dev', path: 'allowances' })
    await screen.findByRole('table', { name: 'Allowance schedules' })
    expect(screen.queryByRole('button', { name: 'New allowance' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /^Pause/ })).not.toBeInTheDocument()
    expect(
      screen.getByRole('button', { name: 'Run history for Weekly allowance for Ada' }),
    ).toBeInTheDocument()
  })

  it('does not show the page to a plain member', async () => {
    renderApp({ uid: 'u-sam', path: 'allowances' })
    expect(await screen.findByText('Not available for your role')).toBeInTheDocument()
  })

  it('has an empty state with a next step', async () => {
    renderApp({ path: 'allowances', prepare: (b, id) => (b.household(id).schedules.length = 0) })
    expect(await screen.findByText('No allowances yet')).toBeInTheDocument()
    expect(screen.getAllByRole('button', { name: 'New allowance' }).length).toBeGreaterThan(0)
  })

  it('shows a load error with retry', async () => {
    const { user, backend } = renderApp({
      path: 'allowances',
      prepare: (b) => b.breakRoute(/allowance-schedules$/),
    })
    expect(await screen.findByRole('alert')).toHaveTextContent(/we could not load the allowances/i)
    backend.repair()
    await user.click(screen.getByRole('button', { name: 'Try again' }))
    expect(await screen.findByRole('table', { name: 'Allowance schedules' })).toBeInTheDocument()
    void findField
  })
})
