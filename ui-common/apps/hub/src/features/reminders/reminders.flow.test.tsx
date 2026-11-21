import { fireEvent, screen, waitFor, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { callsTo, navLink, pageHeading, renderHub } from '../../test/renderHub'

const REMINDERS = '/api/shared/v1/reminders'
type Harness = ReturnType<typeof renderHub>
const agenda = () => screen.getByRole('main')

async function openNewReminder(user: Harness['user']) {
  await pageHeading('Reminders')
  await user.click(screen.getByRole('button', { name: 'New reminder' }))
  return screen.getByRole('dialog')
}

function fillTitleAndDue(dialog: HTMLElement, title: string, due: string) {
  fireEvent.change(within(dialog).getByRole('textbox', { name: /Title/ }), {
    target: { value: title },
  })
  fireEvent.change(within(dialog).getByLabelText(/Due/), { target: { value: due } })
}

describe('reminders', () => {
  it('shows an empty state with a next action', async () => {
    const { user } = renderHub({ route: '/reminders' })
    expect(await screen.findByRole('heading', { name: 'No reminders here' })).toBeInTheDocument()
    await user.click(
      within(screen.getByRole('main')).getAllByRole('button', { name: 'New reminder' }).at(-1)!,
    )
    expect(screen.getByRole('dialog', { name: 'New reminder' })).toBeInTheDocument()
  })

  it('validates the form on the client and names each problem', async () => {
    const { user, requests } = renderHub({ route: '/reminders' })
    const dialog = await openNewReminder(user)
    fireEvent.change(within(dialog).getByLabelText(/Due/), { target: { value: '' } })
    await user.selectOptions(within(dialog).getByRole('combobox', { name: 'Repeats' }), 'DAILY')
    const interval = within(dialog).getByRole('spinbutton')
    await user.clear(interval)
    await user.type(interval, '0')
    await user.click(within(dialog).getByRole('button', { name: 'Create reminder' }))
    expect(await within(dialog).findByText('Give the reminder a title.')).toBeInTheDocument()
    expect(within(dialog).getByText('Choose when it is due.')).toBeInTheDocument()
    expect(within(dialog).getByText(/whole number from 1 to 365/)).toBeInTheDocument()
    expect(callsTo(requests, 'POST', REMINDERS)).toHaveLength(0)
  })

  it('creates a repeating reminder and displays its recurrence and status', async () => {
    const { user, requests } = renderHub({ route: '/reminders' })
    const dialog = await openNewReminder(user)
    fillTitleAndDue(dialog, 'Water the plants', '2026-11-25T08:30')
    await user.selectOptions(within(dialog).getByRole('combobox', { name: 'Repeats' }), 'WEEKLY')
    const interval = within(dialog).getByRole('spinbutton', { name: /Every how many weeks/ })
    await user.clear(interval)
    await user.type(interval, '2')
    await user.click(within(dialog).getByRole('button', { name: 'Create reminder' }))

    expect(await screen.findByText('Reminder created')).toBeInTheDocument()
    expect(callsTo(requests, 'POST', REMINDERS)[0]?.body).toEqual({
      title: 'Water the plants',
      dueAt: new Date('2026-11-25T08:30').toISOString(),
      recurrence: { unit: 'WEEKLY', interval: 2 },
    })
    const item = (await within(agenda()).findByText('Water the plants')).closest('li')!
    expect(within(item).getByText(/Personal, Every 2 weeks/)).toBeInTheDocument()
  })

  it('edits a reminder and re-sends its schedule', async () => {
    const { user, requests } = renderHub({ seed: 'demo', route: '/reminders' })
    await user.click(await screen.findByRole('button', { name: 'Edit Renew passport' }))
    const dialog = screen.getByRole('dialog', { name: 'Edit reminder' })
    const title = within(dialog).getByRole('textbox', { name: /Title/ })
    await user.clear(title)
    await user.type(title, 'Renew passport at the embassy')
    await user.click(within(dialog).getByRole('button', { name: 'Save changes' }))

    expect(await screen.findByText('Reminder updated')).toBeInTheDocument()
    const put = callsTo(requests, 'PUT', /\/reminders\/[^/]+$/)[0]
    expect(put?.body).toMatchObject({ title: 'Renew passport at the embassy', recurrence: null })
    expect(await within(agenda()).findByText('Renew passport at the embassy')).toBeInTheDocument()
  })

  it('cancels a reminder after confirmation and finds it under Cancelled', async () => {
    const { user, requests } = renderHub({ seed: 'demo', route: '/reminders' })
    await user.click(await screen.findByRole('button', { name: 'Cancel Renew passport' }))
    await user.click(
      within(screen.getByRole('dialog')).getByRole('button', { name: 'Cancel reminder' }),
    )
    expect(await screen.findByText('Reminder cancelled')).toBeInTheDocument()
    expect(callsTo(requests, 'POST', /\/cancel$/)).toHaveLength(1)
    await waitFor(() =>
      expect(within(agenda()).queryByText('Renew passport')).not.toBeInTheDocument(),
    )

    await user.click(screen.getByRole('tab', { name: 'Cancelled' }))
    const row = (await within(agenda()).findByText('Renew passport')).closest('li')!
    expect(within(row).getByText('Cancelled')).toBeInTheDocument()
    expect(within(row).queryByRole('button')).not.toBeInTheDocument()
  })

  it('lifecycle: due reminders fire, one-offs complete and repeating ones move on', async () => {
    const { user } = renderHub({ seed: 'demo', route: '/reminders' })
    await screen.findByText('Renew passport')
    // The seed has: Renew passport (+9d, one-off), Water the plants (+2d, weekly), Pay property tax (+5d, every 3 months).

    // Two weeks pass (the demo clock tool lives on the Account page); everything above fell due.
    await user.click(await navLink('Account'))
    await user.click(await screen.findByRole('button', { name: 'Advance one week' }))
    await user.click(screen.getByRole('button', { name: 'Advance one week' }))
    await user.click(await navLink('Reminders'))

    await waitFor(() =>
      expect(within(agenda()).queryByText('Renew passport')).not.toBeInTheDocument(),
    )
    const plants = within(agenda()).getByText('Water the plants').closest('li')!
    expect(within(plants).getByText(/Every week/)).toBeInTheDocument()
    expect(
      within(plants).getByRole('button', { name: 'Edit Water the plants' }),
    ).toBeInTheDocument()
    expect(within(agenda()).getByText('Pay property tax')).toBeInTheDocument()

    await user.click(screen.getByRole('tab', { name: 'Completed' }))
    const done = (await within(agenda()).findByText('Renew passport')).closest('li')!
    expect(within(done).getByText('Completed')).toBeInTheDocument()
    expect(within(agenda()).getByText('Book dentist')).toBeInTheDocument()
    // Completed reminders can no longer be edited or cancelled.
    expect(within(done).queryByRole('button')).not.toBeInTheDocument()
  })

  it('creates a household reminder and filters by scope', async () => {
    const { user, requests } = renderHub({ seed: 'demo', route: '/reminders' })
    const dialog = await openNewReminder(user)
    await screen.findByRole('option', { name: 'Rivera household' })
    fillTitleAndDue(dialog, 'Family dinner', '2026-12-05T18:00')
    await user.selectOptions(
      within(dialog).getByRole('combobox', { name: /Who is it for/ }),
      'Rivera household',
    )
    await user.click(within(dialog).getByRole('button', { name: 'Create reminder' }))
    await screen.findByText('Reminder created')
    const body = callsTo(requests, 'POST', REMINDERS)[0]?.body as { householdId?: string }
    expect(body.householdId).toBeTruthy()

    await user.selectOptions(
      screen.getByRole('combobox', { name: 'Show reminders for' }),
      'Personal only',
    )
    await waitFor(() =>
      expect(within(agenda()).queryByText('Family dinner')).not.toBeInTheDocument(),
    )
    expect(within(agenda()).getByText('Renew passport')).toBeInTheDocument()

    await user.selectOptions(
      screen.getByRole('combobox', { name: 'Show reminders for' }),
      'Rivera household',
    )
    expect(await within(agenda()).findByText('Family dinner')).toBeInTheDocument()
    expect(within(agenda()).queryByText('Renew passport')).not.toBeInTheDocument()
  })

  it('lets only creators and household owners change a household reminder', async () => {
    const { user } = renderHub({ seed: 'demo', route: '/reminders' })
    // Alice (owner) can change the household reminder she created; Bob (member, not creator) cannot.
    expect(await screen.findByRole('button', { name: 'Edit Pay property tax' })).toBeInTheDocument()
    await user.selectOptions(screen.getByRole('combobox', { name: 'Switch demo user' }), 'demo-bob')
    expect(await screen.findByText('Pay property tax')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Edit Pay property tax' })).not.toBeInTheDocument()
    expect(
      screen.queryByRole('button', { name: 'Cancel Pay property tax' }),
    ).not.toBeInTheDocument()
  })
})
