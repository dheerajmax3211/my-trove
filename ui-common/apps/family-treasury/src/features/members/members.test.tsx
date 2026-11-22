import { describe, expect, it } from 'vitest'
import type { HouseholdRec } from '../../mock/ledger'
import { findField, getField, renderApp, screen, waitFor, within } from '../../test/renderApp'

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

  it('invites someone with a code: the code is shown once and the open invite is listed', async () => {
    const { user, backend, householdId } = renderApp({ path: 'members' })
    await user.click(await screen.findByRole('button', { name: 'Create invite code' }))
    expect(await screen.findByTestId('invite-code')).toHaveTextContent(/demo-/)
    const table = screen.getByRole('table', { name: 'Pending invites' })
    expect(await within(table).findByText('Member')).toBeInTheDocument()
    expect(backend.household(householdId).invites).toHaveLength(1)
    expect(backend.household(householdId).members.map((m) => m.uid)).not.toContain('u-gran')
  })

  it('cancels an open invite so its code stops working', async () => {
    const { user, backend, householdId } = renderApp({ path: 'members' })
    await user.click(await screen.findByRole('button', { name: 'Create invite code' }))
    await screen.findByTestId('invite-code')
    await user.click(await screen.findByRole('button', { name: /Cancel invite expiring/ }))
    expect(await screen.findByText('No open invite codes.')).toBeInTheDocument()
    expect(backend.household(householdId).invites).toHaveLength(0)
  })

  it('joins a household with a code and gets the invited role and a pot', async () => {
    let household: HouseholdRec | null = null
    const { user, backend } = renderApp({
      uid: 'u-ada',
      path: '/welcome',
      seed: false,
      prepare: (b) => {
        household = b.createHousehold({
          name: 'Garden House',
          currency: 'USD',
          ownerUid: 'u-maya',
          ownerName: 'Maya Okafor',
          approvalThresholdMinor: null,
        })
        household.invites.push({
          id: 'invite-1',
          code: 'join-me',
          role: 'APPROVER',
          createdByUid: 'u-maya',
          createdAt: new Date('2026-11-01T00:00:00Z'),
          expiresAt: new Date('2030-01-01T00:00:00Z'),
          usedAt: null,
        })
      },
    })
    await user.type(await findField('Invite code'), 'join-me')
    await user.click(screen.getByRole('button', { name: 'Join household' }))
    const id = (household as HouseholdRec | null)?.id ?? ''
    await waitFor(() =>
      expect(backend.household(id).members.find((m) => m.uid === 'u-ada')?.role).toBe('APPROVER'),
    )
    expect(backend.accountOf(id, 'POT:u-ada').ownerUid).toBe('u-ada')
  })

  it('says so when the code is wrong or already used', async () => {
    const { user } = renderApp({ uid: 'u-ada', path: '/welcome', seed: false })
    await user.type(await findField('Invite code'), 'not-a-code')
    await user.click(screen.getByRole('button', { name: 'Join household' }))
    expect(await screen.findByText(/invalid, already used or expired/i)).toBeInTheDocument()
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
