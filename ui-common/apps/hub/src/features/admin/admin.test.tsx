import { screen, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { DEMO_USERS } from '../../mock/seed'
import { callsTo, pageHeading, renderHub } from '../../test/renderHub'

const [ALICE, BOB] = DEMO_USERS
const ADMIN_USERS = '/api/auth/v1/admin/users'

async function lookUp(user: ReturnType<typeof renderHub>['user'], id: string) {
  await pageHeading('Users and roles')
  const field = screen.getByRole('textbox', { name: /User ID/ })
  await user.clear(field)
  await user.type(field, id)
  await user.click(screen.getByRole('button', { name: 'Look up user' }))
}

describe('admin area', () => {
  it('explains the guardrails up front', async () => {
    renderHub({ route: '/admin' })
    await pageHeading('Users and roles')
    expect(screen.getByText('The USER role cannot be revoked from anyone.')).toBeInTheDocument()
    expect(screen.getByText(/cannot revoke your own ADMIN role/)).toBeInTheDocument()
  })

  it('looks a user up by ID and shows their roles', async () => {
    const { user, requests } = renderHub({ route: '/admin' })
    await lookUp(user, BOB!.userId)
    const roles = await screen.findByRole('list', { name: /Roles for bob@example.test/ })
    expect(within(roles).getByText('USER').closest('li')).toHaveTextContent('Granted')
    expect(within(roles).getByText('ADMIN').closest('li')).toHaveTextContent('Not granted')
    expect(callsTo(requests, 'GET', `${ADMIN_USERS}/${BOB!.userId}`)).toHaveLength(1)
  })

  it('grants and then revokes ADMIN, confirming the revoke', async () => {
    const { user, requests } = renderHub({ route: '/admin' })
    await lookUp(user, BOB!.userId)
    await user.click(await screen.findByRole('button', { name: 'Grant ADMIN to bob@example.test' }))
    expect(await screen.findByText('ADMIN granted')).toBeInTheDocument()
    expect(callsTo(requests, 'PUT', `${ADMIN_USERS}/${BOB!.userId}/roles/ADMIN`)).toHaveLength(1)

    await user.click(
      await screen.findByRole('button', { name: 'Revoke ADMIN from bob@example.test' }),
    )
    await user.click(
      within(screen.getByRole('dialog')).getByRole('button', { name: 'Revoke ADMIN' }),
    )
    expect(await screen.findByText('ADMIN revoked')).toBeInTheDocument()
    expect(callsTo(requests, 'DELETE', `${ADMIN_USERS}/${BOB!.userId}/roles/ADMIN`)).toHaveLength(1)
    expect(
      await screen.findByRole('button', { name: 'Grant ADMIN to bob@example.test' }),
    ).toBeInTheDocument()
  })

  it('disables the guarded revokes and says why', async () => {
    const { user } = renderHub({ route: '/admin' })
    // Your own ADMIN role.
    await lookUp(user, ALICE!.userId)
    const ownAdmin = await screen.findByRole('button', {
      name: 'Revoke ADMIN from alice@example.test',
    })
    expect(ownAdmin).toBeDisabled()
    expect(ownAdmin).toHaveAccessibleDescription(/cannot revoke your own ADMIN role/)
    // The USER role, for anyone.
    const userRole = screen.getByRole('button', { name: 'Revoke USER from alice@example.test' })
    expect(userRole).toBeDisabled()
    expect(userRole).toHaveAccessibleDescription(/cannot be revoked/)
  })

  it('reports an unknown ID and rejects a malformed one without calling the server', async () => {
    const { user, requests } = renderHub({ route: '/admin' })
    await lookUp(user, 'not-an-id')
    expect(await screen.findByText(/A user ID looks like/)).toBeInTheDocument()
    expect(callsTo(requests, 'GET', /admin\/users/)).toHaveLength(0)

    await lookUp(user, '0198a1ce-0000-7000-8000-0000000000ff')
    expect(
      await screen.findByText('No user has that ID. Check it and try again.'),
    ).toBeInTheDocument()
  })

  it('fills the lookup from the demo user list', async () => {
    const { user, requests } = renderHub({ route: '/admin' })
    await pageHeading('Users and roles')
    await user.click(screen.getByRole('button', { name: "Use Carol Nguyen's ID" }))
    expect(
      await screen.findByRole('list', { name: /Roles for carol@example.test/ }),
    ).toBeInTheDocument()
    expect(callsTo(requests, 'GET', /admin\/users\/.+/)).toHaveLength(1)
  })
})
