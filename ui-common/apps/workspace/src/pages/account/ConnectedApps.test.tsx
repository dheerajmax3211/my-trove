import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import { renderDemo } from '../../testing/harness'

describe('Connected apps on the Account page', () => {
  it('lists the apps a member has been granted access to, with scope, expiry and state', async () => {
    renderDemo('MEMBER', { path: '/account' })
    const list = await screen.findByRole('list', { name: 'Apps with access to your data' })
    expect(within(list).getByText('Sample planner (demo)')).toBeInTheDocument()
    expect(within(list).getByText('reminders:read')).toBeInTheDocument()
    expect(within(list).getByText('Active')).toBeInTheDocument()
    expect(within(list).getByText(/Show your reminders/)).toBeInTheDocument()
  })

  it('revokes a grant after confirmation, and the app leaves the list', async () => {
    const user = userEvent.setup()
    renderDemo('MEMBER', { path: '/account' })
    const list = await screen.findByRole('list', { name: 'Apps with access to your data' })
    await user.click(within(list).getByRole('button', { name: 'Disconnect Sample planner (demo)' }))

    const confirm = await screen.findByRole('dialog', { name: 'Disconnect Sample planner (demo)?' })
    expect(within(confirm).getByText(/cannot be undone/)).toBeInTheDocument()
    await user.click(within(confirm).getByRole('button', { name: 'Disconnect' }))

    await waitFor(() =>
      expect(screen.getByText('Nothing is connected to your account.')).toBeInTheDocument(),
    )
  })

  it('tells a role without connections:manage why it cannot see connected apps', async () => {
    renderDemo('AUDITOR', { path: '/account' })
    expect(
      await screen.findByText(/Your role does not include connections:manage/),
    ).toBeInTheDocument()
    expect(
      screen.queryByRole('list', { name: 'Apps with access to your data' }),
    ).not.toBeInTheDocument()
  })
})
