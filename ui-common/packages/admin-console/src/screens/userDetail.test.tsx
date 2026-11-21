import { screen, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { demoId } from '../demo/seed'
import { callsTo, problem, renderAdmin } from '../testing/harness'

const HANNAH = demoId(6) // MEMBER, PRO
const TOMAS = demoId(2) // ADMIN
const MAYA = demoId(1) // OWNER

const detail = (id: string) => `/users/${id}`
const userUrl = (id: string) => `/v1/admin/users/${id}`

describe('User detail: reading', () => {
  it('shows the account, roles with descriptions and the recent changes with names', async () => {
    renderAdmin({ route: detail(HANNAH) })
    expect(
      await screen.findByRole('heading', { level: 1, name: 'Hannah Lindqvist' }),
    ).toBeInTheDocument()
    expect(screen.getByText('hannah@example.com', { selector: 'p' })).toBeInTheDocument()
    expect(screen.getByText(HANNAH)).toBeInTheDocument()
    expect(await screen.findByText(/Plan changed: FREE to PRO/)).toBeInTheDocument()
    expect(await screen.findByText('By Maya Ortiz')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Audit trail' })).toHaveAttribute(
      'href',
      `/app/admin/audit?target=${HANNAH}`,
    )
  })

  it('a user that does not exist says so', async () => {
    renderAdmin({ route: detail(demoId(999)) })
    expect(
      await screen.findByRole('heading', { name: 'That user does not exist' }),
    ).toBeInTheDocument()
  })

  it('a 403 from the API is handled', async () => {
    renderAdmin({
      route: detail(HANNAH),
      intercept: (r) => (r.path === userUrl(HANNAH) ? problem(403, 'Access Denied') : undefined),
    })
    expect(
      await screen.findByRole('heading', { name: 'The platform did not allow this' }),
    ).toBeInTheDocument()
  })
})

describe('User detail: what each persona may change', () => {
  it('an owner can grant roles, suspend and change the plan', async () => {
    renderAdmin({ route: detail(HANNAH) })
    await screen.findByRole('heading', { level: 1, name: 'Hannah Lindqvist' })
    expect(
      await screen.findByRole('button', { name: 'Grant ADMIN to Hannah Lindqvist' }),
    ).toBeEnabled()
    expect(screen.getByRole('button', { name: 'Grant OWNER to Hannah Lindqvist' })).toBeEnabled()
    expect(screen.getByRole('button', { name: 'Suspend user' })).toBeEnabled()
    expect(screen.getByRole('combobox', { name: 'Plan' })).toBeEnabled()
  })

  it('an admin can grant ordinary roles and suspend, but not ADMIN or OWNER, and cannot change plans', async () => {
    renderAdmin({ persona: 'ADMIN', route: detail(HANNAH) })
    expect(
      await screen.findByRole('button', { name: 'Grant DEVELOPER to Hannah Lindqvist' }),
    ).toBeEnabled()
    expect(screen.getByRole('button', { name: 'Grant ADMIN to Hannah Lindqvist' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Grant OWNER to Hannah Lindqvist' })).toBeDisabled()
    expect(screen.getAllByText(/Only an owner can change/).length).toBeGreaterThan(0)
    expect(screen.getByRole('button', { name: 'Suspend user' })).toBeEnabled()
    expect(screen.queryByRole('combobox', { name: 'Plan' })).not.toBeInTheDocument()
    expect(screen.getByText(/Only an owner can change plans\./)).toBeInTheDocument()
  })

  it('an auditor reads everything and can change nothing', async () => {
    renderAdmin({ persona: 'AUDITOR', route: detail(HANNAH) })
    expect(
      await screen.findByRole('heading', { level: 1, name: 'Hannah Lindqvist' }),
    ).toBeInTheDocument()
    expect(await screen.findByText('You can read roles but not change them.')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /^Grant / })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /^Revoke / })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Suspend user' })).not.toBeInTheDocument()
    expect(screen.queryByRole('combobox', { name: 'Plan' })).not.toBeInTheDocument()
    expect(screen.getByText(/needs the users:write permission/)).toBeInTheDocument()
  })
})

describe('User detail: acting', () => {
  it('grant then revoke call the right URLs and the screen follows', async () => {
    const { user, requests } = renderAdmin({ route: detail(HANNAH) })
    await user.click(
      await screen.findByRole('button', { name: 'Grant DEVELOPER to Hannah Lindqvist' }),
    )
    expect(await screen.findByText('Granted DEVELOPER to Hannah Lindqvist.')).toBeInTheDocument()
    const put = callsTo(requests, 'PUT', `${userUrl(HANNAH)}/roles/DEVELOPER`)
    expect(put).toHaveLength(1)
    expect(put[0]?.service).toBe('auth')
    // the button now offers the opposite action
    await user.click(
      await screen.findByRole('button', { name: 'Revoke DEVELOPER from Hannah Lindqvist' }),
    )
    expect(await screen.findByText('Revoked DEVELOPER from Hannah Lindqvist.')).toBeInTheDocument()
    expect(callsTo(requests, 'DELETE', `${userUrl(HANNAH)}/roles/DEVELOPER`)).toHaveLength(1)
    expect(
      await screen.findByRole('button', { name: 'Grant DEVELOPER to Hannah Lindqvist' }),
    ).toBeInTheDocument()
  })

  it('a change refreshes the audit trail and the user list', async () => {
    const { user, requests } = renderAdmin({ route: detail(HANNAH) })
    await user.click(
      await screen.findByRole('button', { name: 'Grant DEVELOPER to Hannah Lindqvist' }),
    )
    await screen.findByText('Granted DEVELOPER to Hannah Lindqvist.')
    expect(await screen.findByText('Role granted: Role DEVELOPER')).toBeInTheDocument()
    expect(callsTo(requests, 'GET', '/v1/admin/audit').length).toBeGreaterThanOrEqual(2)
  })

  it('suspend asks first, then posts; restore posts straight away', async () => {
    const { user, requests } = renderAdmin({ route: detail(HANNAH) })
    await user.click(await screen.findByRole('button', { name: 'Suspend user' }))
    const dialog = await screen.findByRole('dialog', { name: 'Suspend Hannah Lindqvist?' })
    // cancelling does nothing
    await user.click(within(dialog).getByRole('button', { name: 'Cancel' }))
    expect(callsTo(requests, 'POST', `${userUrl(HANNAH)}/suspend`)).toHaveLength(0)

    await user.click(screen.getByRole('button', { name: 'Suspend user' }))
    await user.click(
      within(await screen.findByRole('dialog')).getByRole('button', { name: 'Suspend user' }),
    )
    expect(await screen.findByText('Suspended Hannah Lindqvist.')).toBeInTheDocument()
    expect(callsTo(requests, 'POST', `${userUrl(HANNAH)}/suspend`)).toHaveLength(1)

    await user.click(await screen.findByRole('button', { name: 'Restore user' }))
    expect(await screen.findByText('Restored Hannah Lindqvist.')).toBeInTheDocument()
    expect(callsTo(requests, 'POST', `${userUrl(HANNAH)}/restore`)).toHaveLength(1)
    expect(await screen.findByRole('button', { name: 'Suspend user' })).toBeInTheDocument()
  })

  it('an owner changes the plan', async () => {
    const { user, requests } = renderAdmin({ route: detail(HANNAH) })
    const select = await screen.findByRole('combobox', { name: 'Plan' })
    expect(screen.getByRole('button', { name: 'Change plan' })).toBeDisabled() // unchanged
    await user.selectOptions(select, 'DEVELOPER')
    await user.click(screen.getByRole('button', { name: 'Change plan' }))
    expect(
      await screen.findByText('Moved Hannah Lindqvist to the DEVELOPER plan.'),
    ).toBeInTheDocument()
    expect(callsTo(requests, 'PUT', `${userUrl(HANNAH)}/plan/DEVELOPER`)).toHaveLength(1)
  })
})

describe('User detail: guardrail messages come from the server, word for word', () => {
  const PRIVILEGED = 'Only an OWNER can grant or revoke ADMIN or OWNER, or change an ADMIN or OWNER'

  it('privileged role required: an admin acting on an admin', async () => {
    const { user } = renderAdmin({ persona: 'ADMIN', route: detail(TOMAS) })
    // Tomas is the admin himself; granting him anything is a change to an ADMIN
    await user.click(await screen.findByRole('button', { name: 'Grant DEVELOPER to Tomas Reyes' }))
    const alert = await screen.findByText('Could not grant the role')
    expect(alert).toBeInTheDocument()
    expect(screen.getByText(PRIVILEGED)).toBeInTheDocument()
  })

  it('baseline role: MEMBER cannot be revoked', async () => {
    const { user } = renderAdmin({ route: detail(HANNAH) })
    await user.click(
      await screen.findByRole('button', { name: 'Revoke MEMBER from Hannah Lindqvist' }),
    )
    expect(await screen.findByText('Could not revoke the role')).toBeInTheDocument()
    expect(
      screen.getByText('The MEMBER role is held by everyone and cannot be revoked'),
    ).toBeInTheDocument()
  })

  it('last owner: the only owner cannot be demoted or suspended', async () => {
    const { user } = renderAdmin({ route: detail(MAYA) })
    await user.click(await screen.findByRole('button', { name: 'Revoke OWNER from Maya Ortiz' }))
    expect(
      await screen.findByText('The last active OWNER cannot be removed or suspended'),
    ).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Suspend user' }))
    await user.click(
      within(await screen.findByRole('dialog')).getByRole('button', { name: 'Suspend user' }),
    )
    expect(await screen.findByText('Could not suspend this user')).toBeInTheDocument()
    expect(
      screen.getByText('The last active OWNER cannot be removed or suspended'),
    ).toBeInTheDocument()
  })

  it('self suspend', async () => {
    const { user } = renderAdmin({
      route: detail(HANNAH),
      intercept: (r) =>
        r.path === `${userUrl(HANNAH)}/suspend`
          ? problem(400, 'You cannot suspend your own account', 'Bad Request')
          : undefined,
    })
    await user.click(await screen.findByRole('button', { name: 'Suspend user' }))
    await user.click(
      within(await screen.findByRole('dialog')).getByRole('button', { name: 'Suspend user' }),
    )
    expect(await screen.findByText('You cannot suspend your own account')).toBeInTheDocument()
  })

  it('a failed change leaves the screen as it was and clears when the next one succeeds', async () => {
    const { user } = renderAdmin({ route: detail(HANNAH) })
    await user.click(
      await screen.findByRole('button', { name: 'Revoke MEMBER from Hannah Lindqvist' }),
    )
    await screen.findByText('Could not revoke the role')
    expect(
      screen.getByRole('button', { name: 'Revoke MEMBER from Hannah Lindqvist' }),
    ).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Grant DEVELOPER to Hannah Lindqvist' }))
    await screen.findByText('Granted DEVELOPER to Hannah Lindqvist.')
    expect(screen.queryByText('Could not revoke the role')).not.toBeInTheDocument()
  })

  it('a network failure during a change is reported', async () => {
    const { user } = renderAdmin({
      route: detail(HANNAH),
      intercept: (r) =>
        r.method === 'PUT' ? Promise.reject(new TypeError('Failed to fetch')) : undefined,
    })
    await user.click(
      await screen.findByRole('button', { name: 'Grant DEVELOPER to Hannah Lindqvist' }),
    )
    expect(await screen.findByText('Could not grant the role')).toBeInTheDocument()
    expect(screen.getByText('The request could not reach the server.')).toBeInTheDocument()
  })
})
