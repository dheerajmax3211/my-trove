import { describe, expect, it } from 'vitest'
import { renderApp, screen, waitFor, within } from '../../test/renderApp'

describe('reconciliation', () => {
  it('says everything adds up when the balances match the ledger', async () => {
    const { user, backend } = renderApp({ path: 'reconciliation' })
    expect(
      await screen.findByText(/nothing has been checked in this visit yet/i),
    ).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Run the check' }))
    const ok = await screen.findByText('Everything adds up.')
    expect(ok.closest('[role="status"]')).toHaveTextContent(
      /all 10 accounts match their ledger entries/i,
    )
    expect(backend.requests.filter((r) => r.path.endsWith('/reconciliation'))).toHaveLength(1)
    expect(screen.getByRole('button', { name: 'Run the check again' })).toBeInTheDocument()
  })

  it('shows drift per account, clearly, and changes nothing', async () => {
    const { user, backend, householdId } = renderApp({
      path: 'reconciliation',
      prepare: (b, id) => b.injectDrift(id, 'POOL', 500),
    })
    await user.click(await screen.findByRole('button', { name: 'Run the check' }))

    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent('Drift found in 1 account')
    expect(alert).toHaveTextContent(/nothing has been changed/i)
    expect(screen.queryByText('Everything adds up.')).not.toBeInTheDocument()

    const table = screen.getByRole('table', { name: 'Accounts with drift' })
    const row = within(table).getAllByRole('row')[1]!
    const cells = within(row)
      .getAllByRole('cell')
      .map((c) => c.textContent)
    expect(cells).toEqual(['Household pool', '$2,175.30', '$2,170.30', '+$5.00'])
    // Reporting is read-only: the (corrupted) projection is still what it was.
    expect(backend.balanceOf(householdId, 'POOL')).toBe(217_530)
  })

  it('goes from drift back to OK after the next check once the data is fixed', async () => {
    const { user, backend, householdId } = renderApp({ path: 'reconciliation' })
    await user.click(await screen.findByRole('button', { name: 'Run the check' }))
    await screen.findByText('Everything adds up.')
    backend.injectDrift(householdId, 'POT:u-sam', -100)
    await user.click(screen.getByRole('button', { name: 'Run the check again' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Drift found in 1 account')
    expect(screen.getByRole('table', { name: 'Accounts with drift' })).toHaveTextContent(
      'Sam Okafor pot',
    )
    backend.injectDrift(householdId, 'POT:u-sam', 100)
    await user.click(screen.getByRole('button', { name: 'Run the check again' }))
    expect(await screen.findByText('Everything adds up.')).toBeInTheDocument()
  })

  it('is for the owner only', async () => {
    const { backend } = renderApp({ uid: 'u-dev', path: 'reconciliation' })
    expect(await screen.findByText('Not available for your role')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /run the check/i })).not.toBeInTheDocument()
    expect(screen.queryByRole('link', { name: 'Reconciliation' })).not.toBeInTheDocument()
    expect(backend.requests.filter((r) => r.path.endsWith('/reconciliation'))).toHaveLength(0)
  })

  it('shows an error with retry when the check cannot run', async () => {
    const { user, backend } = renderApp({
      path: 'reconciliation',
      prepare: (b) => b.breakRoute(/\/reconciliation$/),
    })
    await user.click(await screen.findByRole('button', { name: 'Run the check' }))
    expect(await screen.findByRole('alert')).toHaveTextContent(/the check could not run/i)
    backend.repair()
    await user.click(screen.getByRole('button', { name: 'Try again' }))
    expect(await screen.findByText('Everything adds up.')).toBeInTheDocument()
    await waitFor(() => expect(screen.queryByText(/could not run/i)).not.toBeInTheDocument())
  })
})
