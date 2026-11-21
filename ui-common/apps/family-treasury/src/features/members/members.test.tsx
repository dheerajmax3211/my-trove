import { describe, expect, it } from 'vitest'
import { findField, getField, renderApp, screen, within } from '../../test/renderApp'

describe('members and roles', () => {
  it('lists members with roles and pot balances, and what each role can do', async () => {
    renderApp({ path: 'members' })
    const table = await screen.findByRole('table', { name: 'Household members' })
    const rows = within(table).getAllByRole('row').slice(1)
    expect(rows).toHaveLength(4)
    expect(within(rows[0]!).getByText('Maya Okafor')).toBeInTheDocument()
    expect(within(rows[0]!).getByText('(you)')).toBeInTheDocument()
    expect(within(rows[3]!).getByText('$26.67')).toBeInTheDocument()

    const matrix = screen.getByRole('table', { name: 'Permissions by role' })
    const headers = within(matrix)
      .getAllByRole('columnheader')
      .map((h) => h.textContent)
    expect(headers).toEqual(['Action', 'Owner', 'Approver', 'Member', 'Kid'])
    const cellsOf = (label: RegExp) =>
      within(within(matrix).getByRole('rowheader', { name: label }).closest('tr')!)
        .getAllByRole('cell')
        .map((c) => c.textContent)
    expect(cellsOf(/reverse a ledger entry/i)).toEqual(['Yes', 'Yes', 'No', 'No'])
    expect(cellsOf(/create and pause allowance/i)).toEqual(['Yes', 'No', 'No', 'No'])
    expect(cellsOf(/own pot/i)).toEqual(['Yes', 'Yes', 'Yes', 'Yes'])
    expect(cellsOf(/run the reconciliation/i)).toEqual(['Yes', 'No', 'No', 'No'])
  })

  it('adds a member, who gets a pot, and validates the form', async () => {
    const { user, backend, householdId } = renderApp({ path: 'members' })
    await user.click(await screen.findByRole('button', { name: 'Add member' }))
    const dialog = await screen.findByRole('dialog', { name: 'Add a member' })
    await user.click(within(dialog).getByRole('button', { name: 'Add member' }))
    expect(await within(dialog).findByText('Enter their member ID.')).toBeInTheDocument()

    await user.type(getField('Member ID'), 'u-gran')
    await user.type(getField('Name'), 'Grandma')
    await user.selectOptions(getField('Role'), 'Approver')
    await user.click(within(dialog).getByRole('button', { name: 'Add member' }))

    expect(await screen.findByText('Member added')).toBeInTheDocument()
    const table = screen.getByRole('table', { name: 'Household members' })
    expect(await within(table).findByText('Grandma')).toBeInTheDocument()
    expect(backend.accountOf(householdId, 'POT:u-gran').ownerUid).toBe('u-gran')
    expect(backend.household(householdId).members.find((m) => m.uid === 'u-gran')?.role).toBe(
      'APPROVER',
    )
  })

  it('says so when the person is already a member', async () => {
    const { user } = renderApp({ path: 'members' })
    await user.click(await screen.findByRole('button', { name: 'Add member' }))
    await user.type(await findField('Member ID'), 'u-dev')
    await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Add member' }))
    expect(await screen.findByText(/already a member of this household/i)).toBeInTheDocument()
  })

  it('changes a role', async () => {
    const { user, backend, householdId } = renderApp({ path: 'members' })
    await user.selectOptions(
      await screen.findByRole('combobox', { name: 'Role for Sam Okafor' }),
      'Approver',
    )
    expect(await screen.findByText('Role changed')).toBeInTheDocument()
    expect(backend.household(householdId).members.find((m) => m.uid === 'u-sam')?.role).toBe(
      'APPROVER',
    )
  })

  it('refuses to demote the last owner, with a clear message', async () => {
    const { user, backend, householdId } = renderApp({ path: 'members' })
    await user.selectOptions(
      await screen.findByRole('combobox', { name: 'Role for Maya Okafor' }),
      'Member',
    )
    expect(await screen.findByRole('alert')).toHaveTextContent(/needs at least one owner/i)
    expect(backend.household(householdId).members.find((m) => m.uid === 'u-maya')?.role).toBe(
      'OWNER',
    )
  })

  it('saves the approval limit and validates the expiry', async () => {
    const { user, backend, householdId } = renderApp({ path: 'members' })
    const limit = await findField('Approval limit')
    await user.clear(limit)
    await user.type(limit, '50')
    const hours = getField('Requests expire after (hours)')
    await user.clear(hours)
    await user.type(hours, '0')
    await user.click(screen.getByRole('button', { name: 'Save settings' }))
    expect(await screen.findByText(/whole number of hours from 1 to 8760/i)).toBeInTheDocument()

    await user.clear(hours)
    await user.type(hours, '24')
    await user.click(screen.getByRole('button', { name: 'Save settings' }))
    expect(await screen.findByText('Settings saved')).toBeInTheDocument()
    expect(backend.household(householdId)).toMatchObject({
      approvalThresholdMinor: 5000,
      approvalExpiryHours: 24,
    })
  })

  it('is read-only for a plain member', async () => {
    renderApp({ uid: 'u-sam', path: 'members' })
    await screen.findByRole('table', { name: 'Household members' })
    expect(screen.queryByRole('button', { name: 'Add member' })).not.toBeInTheDocument()
    expect(screen.queryByRole('combobox', { name: /^Role for/ })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Save settings' })).not.toBeInTheDocument()
    expect(screen.getByRole('table', { name: 'Permissions by role' })).toBeInTheDocument()
  })
})
