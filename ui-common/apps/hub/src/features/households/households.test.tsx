import { screen, waitFor, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import {
  callsTo,
  navLink,
  pageHeading,
  renderHub,
  type RecordedRequest,
} from '../../test/renderHub'

const SHARED = '/api/shared/v1'

async function createHousehold(user: ReturnType<typeof renderHub>['user'], name: string) {
  await user.click((await screen.findAllByRole('button', { name: 'Create household' }))[0]!)
  await user.type(screen.getByRole('textbox', { name: /Household name/ }), name)
  await user.click(
    within(screen.getByRole('dialog')).getByRole('button', { name: 'Create household' }),
  )
  return pageHeading(name.trim())
}

/** Creates an invite as the current user and returns its code. */
async function createInviteCode(user: ReturnType<typeof renderHub>['user'], role?: 'Owner') {
  if (role) await user.selectOptions(screen.getByRole('combobox', { name: 'Invite as' }), role)
  await user.click(screen.getByRole('button', { name: 'Create invite code' }))
  return (await screen.findByTestId('invite-code')).textContent ?? ''
}

async function switchTo(user: ReturnType<typeof renderHub>['user'], uid: string) {
  await user.selectOptions(screen.getByRole('combobox', { name: 'Switch demo user' }), uid)
}

async function join(user: ReturnType<typeof renderHub>['user'], code: string) {
  await user.click((await screen.findAllByRole('button', { name: 'Join with a code' }))[0]!)
  await user.type(screen.getByRole('textbox', { name: /Invite code/ }), code)
  await user.click(
    within(screen.getByRole('dialog')).getByRole('button', { name: 'Join household' }),
  )
}

describe('households list', () => {
  it('shows an empty state with both next actions, then lists a created household', async () => {
    const { user, requests } = renderHub({ route: '/households' })
    expect(
      await screen.findByRole('heading', { name: 'You are not in a household yet' }),
    ).toBeInTheDocument()

    await createHousehold(user, '  Rivera home  ')
    const post = callsTo(requests, 'POST', `${SHARED}/households`)[0]
    expect(post?.body).toEqual({ name: 'Rivera home' })
    expect(await screen.findByText('Owner', { selector: 'span' })).toBeInTheDocument()
  })

  it('validates the name on the client before calling the server', async () => {
    const { user, requests } = renderHub({ route: '/households' })
    await user.click((await screen.findAllByRole('button', { name: 'Create household' }))[0]!)
    await user.click(
      within(screen.getByRole('dialog')).getByRole('button', { name: 'Create household' }),
    )
    expect(await screen.findByText('Give the household a name.')).toBeInTheDocument()
    expect(callsTo(requests, 'POST', `${SHARED}/households`)).toHaveLength(0)
  })

  it('links each household to its detail page', async () => {
    const { user } = renderHub({ seed: 'demo', route: '/households' })
    await user.click(await screen.findByRole('link', { name: 'Rivera household' }))
    expect(await pageHeading('Rivera household')).toBeInTheDocument()
  })
})

describe('invite and accept flow', () => {
  it('creates an invite, accepts it as another user, then changes that user role', async () => {
    const { user, requests } = renderHub({ route: '/households' })
    await createHousehold(user, 'Lake house')

    // Owner creates an invite: the code is shown once and can be copied.
    const code = await createInviteCode(user)
    expect(code).toHaveLength(24)
    expect(screen.getByText(/shown only this once/)).toBeInTheDocument()
    const invitePost = callsTo(requests, 'POST', /\/invites$/)[0]
    expect(invitePost?.body).toEqual({ role: 'MEMBER', ttlHours: 168 })
    await user.click(screen.getByRole('button', { name: 'Copy code' }))
    expect(await screen.findByText('Copied to clipboard')).toBeInTheDocument()
    expect(await navigator.clipboard.readText()).toBe(code)

    // The pending list now has it.
    const pending = await screen.findByRole('table', { name: 'Pending invites' })
    expect(within(pending).getAllByRole('row')).toHaveLength(2)

    // Bob signs in via the demo switcher and accepts.
    await switchTo(user, 'demo-bob')
    await user.click(await navLink('Households'))
    await join(user, code)
    expect(await pageHeading('Lake house')).toBeInTheDocument()
    // Members cannot see the invites section or role controls.
    expect(screen.queryByRole('heading', { name: 'Invites' })).not.toBeInTheDocument()
    expect(screen.queryByRole('combobox', { name: /Role for/ })).not.toBeInTheDocument()
    expect(callsTo(requests, 'POST', `${SHARED}/invites/accept`)[0]?.body).toEqual({ code })

    // Back as Alice: Bob is a member, and she promotes him.
    await switchTo(user, 'demo-alice')
    await user.click(await navLink('Households'))
    await user.click(await screen.findByRole('link', { name: 'Lake house' }))
    await user.selectOptions(
      await screen.findByRole('combobox', { name: 'Role for demo-bob' }),
      'OWNER',
    )
    expect(await screen.findByText('Role updated')).toBeInTheDocument()
    const put = callsTo(requests, 'PUT', /members\/demo-bob\/role$/)[0]
    expect(put?.body).toEqual({ role: 'OWNER' })
    await waitFor(() =>
      expect(screen.getByRole('combobox', { name: 'Role for demo-bob' })).toHaveValue('OWNER'),
    )
  })

  it('uses a code only once and explains an invalid code', async () => {
    const { user } = renderHub({ route: '/households' })
    await createHousehold(user, 'Cabin')
    const code = await createInviteCode(user)
    await switchTo(user, 'demo-bob')
    await user.click(await navLink('Households'))
    await join(user, code)
    await pageHeading('Cabin')

    await switchTo(user, 'demo-carol')
    await user.click(await navLink('Households'))
    await join(user, code)
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Invite code is invalid, already used or expired',
    )
  })

  it('tells someone who is already a member, without wasting the code', async () => {
    const { user } = renderHub({ route: '/households' })
    await createHousehold(user, 'Cabin')
    const code = await createInviteCode(user)
    await user.click(await navLink('Households'))
    await join(user, code)
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'You are already a member of this household',
    )
  })

  it('revokes a pending invite after confirmation', async () => {
    const { user, requests } = renderHub({ route: '/households' })
    await createHousehold(user, 'Cabin')
    await createInviteCode(user)
    await user.click(await screen.findByRole('button', { name: /Revoke invite expiring/ }))
    await user.click(
      within(screen.getByRole('dialog')).getByRole('button', { name: 'Revoke invite' }),
    )
    expect(await screen.findByText('Invite revoked')).toBeInTheDocument()
    expect(callsTo(requests, 'DELETE', /\/invites\/[^/]+$/)).toHaveLength(1)
    expect(await screen.findByRole('heading', { name: 'No pending invites' })).toBeInTheDocument()
  })

  it('validates the invite lifetime before sending', async () => {
    const { user, requests } = renderHub({ route: '/households' })
    await createHousehold(user, 'Cabin')
    const hours = await screen.findByRole('spinbutton', { name: /Valid for/ })
    await user.clear(hours)
    await user.type(hours, '9999')
    await user.click(screen.getByRole('button', { name: 'Create invite code' }))
    expect(await screen.findByText(/from 1 to 720/)).toBeInTheDocument()
    expect(callsTo(requests, 'POST', /\/invites$/)).toHaveLength(0)
  })
})

describe('roles, last owner and leaving', () => {
  it('surfaces the last-owner rule: no demote, no remove, no leave', async () => {
    const { user } = renderHub({ route: '/households' })
    await createHousehold(user, 'Cabin')

    const role = await screen.findByRole('combobox', { name: 'Role for demo-alice' })
    expect(role).toBeDisabled()
    expect(screen.getByText(/Only one owner right now/)).toBeInTheDocument()
    const leave = screen.getByRole('button', { name: 'Leave household' })
    expect(leave).toBeDisabled()
    expect(screen.getByText(/You are the only owner/)).toBeInTheDocument()
    await user.hover(leave)
    expect(leave).toHaveAccessibleDescription(/only owner/)
  })

  it('lets an owner remove a member after confirming, and refuses nothing silently', async () => {
    const { user, requests } = renderHub({ route: '/households' })
    await createHousehold(user, 'Cabin')
    const code = await createInviteCode(user)
    await switchTo(user, 'demo-bob')
    await user.click(await navLink('Households'))
    await join(user, code)
    await pageHeading('Cabin')
    await switchTo(user, 'demo-alice')
    await user.click(await navLink('Households'))
    await user.click(await screen.findByRole('link', { name: 'Cabin' }))

    await user.click(await screen.findByRole('button', { name: 'Remove demo-bob' }))
    await user.click(
      within(screen.getByRole('dialog')).getByRole('button', { name: 'Remove member' }),
    )
    expect(await screen.findByText('Member removed')).toBeInTheDocument()
    expect(callsTo(requests, 'DELETE', /members\/demo-bob$/)).toHaveLength(1)
    await waitFor(() =>
      expect(screen.queryByRole('combobox', { name: 'Role for demo-bob' })).not.toBeInTheDocument(),
    )
  })

  it('lets a non-last owner leave, then the household disappears from their list', async () => {
    const { user, requests } = renderHub({ route: '/households' })
    await createHousehold(user, 'Cabin')
    const code = await createInviteCode(user, 'Owner')
    await switchTo(user, 'demo-bob')
    await user.click(await navLink('Households'))
    await join(user, code)
    await pageHeading('Cabin')

    await user.click(screen.getByRole('button', { name: 'Leave household' }))
    await user.click(
      within(screen.getByRole('dialog')).getByRole('button', { name: 'Leave household' }),
    )
    expect(await screen.findByRole('heading', { level: 1, name: 'Households' })).toBeInTheDocument()
    expect(
      await screen.findByRole('heading', { name: 'You are not in a household yet' }),
    ).toBeInTheDocument()
    expect(callsTo(requests, 'POST', /\/leave$/)).toHaveLength(1)
  })

  it('shows the server message when a rule is hit anyway (another owner left in the meantime)', async () => {
    let block = false
    const { user } = renderHub({
      route: '/households',
      respond: (r: RecordedRequest) =>
        block && r.path.endsWith('/leave')
          ? new Response(
              JSON.stringify({
                type: 'about:blank',
                title: 'Conflict',
                status: 409,
                detail:
                  'The last owner cannot leave or be demoted; promote another owner or delete the household',
              }),
              { status: 409, headers: { 'content-type': 'application/problem+json' } },
            )
          : undefined,
    })
    await createHousehold(user, 'Cabin')
    const code = await createInviteCode(user, 'Owner')
    await switchTo(user, 'demo-bob')
    await user.click(await navLink('Households'))
    await join(user, code)
    await pageHeading('Cabin')
    block = true
    await user.click(screen.getByRole('button', { name: 'Leave household' }))
    await user.click(
      within(screen.getByRole('dialog')).getByRole('button', { name: 'Leave household' }),
    )
    expect(await within(screen.getByRole('dialog')).findByRole('alert')).toHaveTextContent(
      /last owner cannot leave/,
    )
  })

  it('deletes a household only after typing its name', async () => {
    const { user, requests } = renderHub({ route: '/households' })
    await createHousehold(user, 'Cabin')
    await user.click(await screen.findByRole('button', { name: 'Delete household' }))
    const dialog = screen.getByRole('dialog')
    const confirm = within(dialog).getByRole('button', { name: 'Delete household' })
    expect(confirm).toBeDisabled()
    await user.type(within(dialog).getByRole('textbox'), 'Cabin')
    await user.click(confirm)
    expect(
      await screen.findByRole('heading', { name: 'You are not in a household yet' }),
    ).toBeInTheDocument()
    expect(callsTo(requests, 'DELETE', /\/households\/[^/]+$/)).toHaveLength(1)
  })

  it('does not offer delete to members', async () => {
    const { user } = renderHub({ route: '/households' })
    await createHousehold(user, 'Cabin')
    const code = await createInviteCode(user)
    await switchTo(user, 'demo-bob')
    await user.click(await navLink('Households'))
    await join(user, code)
    await pageHeading('Cabin')
    expect(screen.queryByRole('button', { name: 'Delete household' })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Leave household' })).toBeEnabled()
  })
})
