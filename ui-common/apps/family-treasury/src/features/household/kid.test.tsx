import { describe, expect, it } from 'vitest'
import { apiFor } from '../../test/fixtures'
import {
  findField,
  getField,
  renderApp,
  screen,
  waitForHeading,
  within,
} from '../../test/renderApp'

const navLinks = () =>
  within(screen.getByRole('navigation', { name: 'Household sections' }))
    .getAllByRole('link')
    .map((l) => l.textContent)

describe('kid role: simplified UI and restrictions', () => {
  it('offers a short menu and only the kid’s own pot', async () => {
    renderApp({ uid: 'u-ada' })
    expect(
      await screen.findByRole('heading', { level: 1, name: 'Hi Ada Okafor' }),
    ).toBeInTheDocument()
    expect(navLinks()).toEqual(['My pot', 'Spend', 'My requests', 'Statement'])

    const pot = screen.getByRole('group', { name: 'My pot' })
    expect(within(pot).getByText('$26.67')).toBeInTheDocument()
    // No shared pool, no other members, no pending-approvals for the household.
    expect(screen.queryByText('Shared pool')).not.toBeInTheDocument()
    expect(within(screen.getByRole('main')).queryByText('Sam Okafor')).not.toBeInTheDocument()
    expect(screen.queryByText('Member pots')).not.toBeInTheDocument()
    // Recent activity comes from her own statement (kids cannot read the entry log).
    expect((await screen.findAllByText('Weekly allowance for Ada')).length).toBeGreaterThan(0)
    expect(screen.queryByText('Garage sale proceeds')).not.toBeInTheDocument()
  })

  it.each(['activity', 'allowances', 'reconciliation', 'members'])(
    'blocks the %s page with an explanation instead of an error',
    async (page) => {
      renderApp({ uid: 'u-ada', path: page })
      expect(await screen.findByText('Not available for your role')).toBeInTheDocument()
      expect(screen.getByRole('link', { name: 'Back to the dashboard' })).toBeInTheDocument()
    },
  )

  it('only offers spending, from her own pot, and records it', async () => {
    const { user, backend, householdId } = renderApp({ uid: 'u-ada', path: 'move' })
    await screen.findByRole('heading', { level: 1, name: 'Spend from my pot' })
    expect(screen.getAllByRole('tab').map((t) => t.textContent)).toEqual(['Spend'])
    expect(screen.queryByLabelText('Paid from')).not.toBeInTheDocument()
    expect(screen.getByText(/from your pot: \$26\.67 available/i)).toBeInTheDocument()

    await user.type(await findField('Amount'), '5')
    await user.type(getField('What is it for?'), 'Comic book')
    await user.click(screen.getByRole('button', { name: 'Record spend' }))
    expect(await screen.findByText('Spend recorded')).toBeInTheDocument()
    expect(backend.balanceOf(householdId, 'POT:u-ada')).toBe(2_667 - 500)
  })

  it('cannot spend more than the pot holds', async () => {
    const { user } = renderApp({ uid: 'u-ada', path: 'move' })
    await user.type(await findField('Amount'), '40')
    await user.type(getField('What is it for?'), 'Too big')
    await user.click(screen.getByRole('button', { name: 'Record spend' }))
    expect(await screen.findByText(/only has \$26\.67 available/i)).toBeInTheDocument()
  })

  it('sends a big spend for approval and shows only her own requests', async () => {
    const { user } = renderApp({ uid: 'u-ada', path: 'move' })
    await user.type(await findField('Amount'), '120')
    await user.type(getField('What is it for?'), 'Bike')
    await user.click(screen.getByRole('button', { name: 'Send for approval' }))
    await screen.findByText('Sent for approval')
    await user.click(screen.getByRole('link', { name: /track it in approvals/i }))
    expect(
      await screen.findByRole('heading', { level: 1, name: 'My requests' }),
    ).toBeInTheDocument()
    expect(await screen.findByRole('heading', { name: 'Bike' })).toBeInTheDocument()
    expect(
      screen.queryByRole('heading', { name: 'Winter coats for the kids' }),
    ).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /^approve/i })).not.toBeInTheDocument()
  })

  it('shows only her own statement, even if another account is asked for in the URL', async () => {
    const { backend, householdId } = renderApp({
      uid: 'u-ada',
      path: `statement?account=PLACEHOLDER`,
    })
    void backend
    void householdId
    await screen.findByRole('heading', { level: 1, name: 'My statement' })
    expect(screen.queryByRole('combobox', { name: 'Account' })).not.toBeInTheDocument()
    expect(await screen.findByText(/current balance of/i)).toHaveTextContent('Ada Okafor pot')
  })

  it('is enforced by the service too: entry log and other pots are refused', async () => {
    const { backend, householdId } = renderApp({ uid: 'u-ada' })
    await waitForHeading('Hi Ada Okafor')
    const api = apiFor(backend, 'u-ada')
    await expect(api.listEntries(householdId, 0, 5)).rejects.toMatchObject({ status: 403 })
    await expect(
      api.statement(householdId, backend.accountOf(householdId, 'POT:u-sam').id, {}),
    ).rejects.toMatchObject({ status: 404 })
  })
})
