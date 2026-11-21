import { screen, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { callsTo, pageHeading, renderHub } from '../../test/renderHub'

const AUDIT = '/api/shared/v1/audit'
const table = () => screen.getByRole('table', { name: 'Activity' })

describe('activity', () => {
  it('shows an empty state for a new user', async () => {
    renderHub({ route: '/activity' })
    expect(await screen.findByRole('heading', { name: 'No activity to show' })).toBeInTheDocument()
  })

  it('pages through personal events, newest first, 20 at a time', async () => {
    const { user, runtime, requests } = renderHub({ route: '/activity' })
    await pageHeading('Activity')
    for (let i = 1; i <= 25; i++)
      await runtime.apiClient.post('/shared/v1/reminders', {
        title: `Task ${i}`,
        dueAt: '2026-12-01T09:00:00Z',
      })
    // Changing the filter loads the first page now that the log has entries.
    await user.selectOptions(
      screen.getByRole('combobox', { name: 'Kind of event' }),
      'Created a reminder',
    )
    await within(table()).findByText('title: Task 25')

    expect(within(table()).getAllByRole('row')).toHaveLength(21) // header + 20
    expect(screen.getByText('Showing 1 to 20 of 25')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Previous' })).toBeDisabled()

    await user.click(screen.getByRole('button', { name: 'Next' }))
    await within(table()).findByText('title: Task 5')
    expect(screen.getByText('Showing 21 to 25 of 25')).toBeInTheDocument()
    expect(within(table()).getAllByRole('row')).toHaveLength(6)
    expect(screen.getByRole('button', { name: 'Next' })).toBeDisabled()
    const second = callsTo(requests, 'GET', AUDIT).at(-1)
    expect(second?.query.get('page')).toBe('1')
    expect(second?.query.get('size')).toBe('20')
    expect(second?.query.get('action')).toBe('reminder.created')

    await user.click(screen.getByRole('button', { name: 'Previous' }))
    expect(await within(table()).findByText('title: Task 25')).toBeInTheDocument()
  })

  it('switches to a household feed and attributes who did what', async () => {
    const { user } = renderHub({ seed: 'demo', route: '/activity' })
    await screen.findByRole('option', { name: 'Rivera household' })
    await user.selectOptions(
      screen.getByRole('combobox', { name: 'Whose activity' }),
      'Rivera household',
    )
    const joined = await within(table()).findByRole('row', { name: /Joined a household/ })
    expect(within(joined).getByText('demo-bob')).toBeInTheDocument()
    expect(within(joined).getByText('role: MEMBER')).toBeInTheDocument()
    const created = within(table()).getByRole('row', { name: /Created a household/ })
    expect(within(created).getByText('You')).toBeInTheDocument()
  })

  it('opens a household feed from a link and filters by kind of event', async () => {
    const { user, requests } = renderHub({ seed: 'demo', route: '/households' })
    await user.click(await screen.findByRole('link', { name: 'Rivera household' }))
    await user.click(await screen.findByRole('link', { name: 'View activity' }))
    await pageHeading('Activity')
    expect(
      await within(table()).findByRole('row', { name: /Created a household/ }),
    ).toBeInTheDocument()
    expect(callsTo(requests, 'GET', AUDIT).at(-1)?.query.get('householdId')).toBeTruthy()

    await user.selectOptions(
      screen.getByRole('combobox', { name: 'Kind of event' }),
      'Uploaded a file',
    )
    expect(await within(table()).findByRole('row', { name: /Uploaded a file/ })).toBeInTheDocument()
    expect(
      within(table()).queryByRole('row', { name: /Created a household/ }),
    ).not.toBeInTheDocument()
  })

  it('explains a filter with no matches', async () => {
    const { user } = renderHub({ seed: 'demo', route: '/activity' })
    await user.selectOptions(
      await screen.findByRole('combobox', { name: 'Kind of event' }),
      'Deleted a file',
    )
    expect(await screen.findByText(/No events of that kind yet/)).toBeInTheDocument()
  })

  it('records the actions taken in the app', async () => {
    const { user, runtime } = renderHub({ route: '/activity' })
    await pageHeading('Activity')
    await runtime.apiClient.post('/shared/v1/reminders', {
      title: 'Call mum',
      dueAt: '2026-12-01T09:00:00Z',
    })
    await user.selectOptions(
      screen.getByRole('combobox', { name: 'Kind of event' }),
      'Created a reminder',
    )
    const row = await within(table()).findByRole('row', { name: /Created a reminder/ })
    expect(within(row).getByText('title: Call mum')).toBeInTheDocument()
  })
})
