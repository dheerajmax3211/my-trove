import { screen, waitFor, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { renderApp } from '../test/setup'

const FRIDGE = '00000000-0000-4000-8000-000000000001'
const PUMP = '00000000-0000-4000-8000-000000000003'
const WASHER = '00000000-0000-4000-8000-000000000004'

describe('appliance detail', () => {
  it('shows the status, chart, health summary, alerts and warranty on one page', async () => {
    await renderApp({ path: `/appliances/${FRIDGE}` })
    expect(
      await screen.findByRole('heading', { level: 1, name: 'Kitchen fridge' }),
    ).toBeInTheDocument()
    expect(
      await screen.findByRole('img', { name: 'Power draw, last 24 hours' }),
    ).toBeInTheDocument()
    expect(screen.getByText('Learned normal, 120 W')).toBeInTheDocument()

    const health = (await screen.findByRole('heading', { level: 3, name: 'Health' })).closest(
      'div.flex, div',
    ) as HTMLElement
    const table = await screen.findByRole('table', {
      name: 'Baseline compared with the last 24 hours',
    })
    expect(within(table).getByRole('columnheader', { name: 'Normal' })).toBeInTheDocument()
    const peak = within(table).getByRole('row', { name: /Peak draw/ })
    expect(within(peak).getAllByRole('cell')[0]).toHaveTextContent('125 W')
    expect(within(peak).getAllByRole('cell')[2]).toHaveTextContent(/^\+\d+%$/)
    expect(within(table).getByRole('row', { name: /Duty cycle/ })).toBeInTheDocument()
    expect(health).toBeInTheDocument()
    expect(screen.getByText('Average draw, 24 h')).toBeInTheDocument()
    expect(screen.getByText('Energy, 24 h')).toBeInTheDocument()

    const alerts = screen.getByRole('list', { name: 'Active alerts' })
    expect(within(alerts).getByText(/draws 14% more power/)).toBeInTheDocument()
    expect(
      within(alerts).getByRole('heading', { level: 3, name: /draws 14% more power/ }),
    ).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /See all 2 alerts and history/ })).toHaveAttribute(
      'href',
      `/alerts?appliance=${FRIDGE}&status=ALL`,
    )

    expect(
      screen.getByRole('heading', { level: 3, name: 'Warranty and service' }),
    ).toBeInTheDocument()
    expect(screen.getByText('Under warranty')).toBeInTheDocument()
    expect(screen.getAllByText(/85 days/).length).toBeGreaterThan(0)
    const reminders = within(
      screen.getByRole('heading', { name: 'Upcoming reminders' }).parentElement as HTMLElement,
    )
    expect(reminders.getByText('Claim window')).toBeInTheDocument()
    expect(reminders.getAllByText('High priority')).toHaveLength(2)
    expect(reminders.getByText('Service due')).toBeInTheDocument()
  })

  it('has a one-h1 heading outline, then card titles', async () => {
    await renderApp({ path: `/appliances/${FRIDGE}` })
    await screen.findByRole('list', { name: 'Active alerts' })
    const levels = screen.getAllByRole('heading').map((h) => h.tagName)
    expect(levels.filter((t) => t === 'H1')).toHaveLength(1)
    expect(levels.indexOf('H1')).toBeLessThan(levels.indexOf('H3'))
  })

  it('acknowledges an alert from the appliance page and refreshes the card counts', async () => {
    const { user } = await renderApp({ path: `/appliances/${PUMP}` })
    const alerts = await screen.findByRole('list', { name: 'Active alerts' })
    expect(
      within(alerts).getByRole('heading', { name: /running non-stop for 20 h/ }),
    ).toBeInTheDocument()
    await user.click(within(alerts).getByRole('button', { name: /Acknowledge/ }))
    await waitFor(() => expect(within(alerts).getByText('Acknowledged')).toBeInTheDocument())
    expect(screen.getByText('Overdue')).toBeInTheDocument()
  })

  it('invites connecting a device when there is none', async () => {
    await renderApp({ path: `/appliances/${WASHER}` })
    expect(await screen.findByRole('heading', { name: 'No device connected' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Connect a device' })).toHaveAttribute(
      'href',
      `/devices?appliance=${WASHER}`,
    )
    expect(
      screen.getByText('No active alerts. We will list anything unusual here.'),
    ).toBeInTheDocument()
    expect(screen.queryByRole('group', { name: 'Time range' })).not.toBeInTheDocument()
  })

  it('explains a missing appliance and offers a way back', async () => {
    await renderApp({ path: '/appliances/00000000-0000-4000-8000-0000000000ff' })
    expect(
      await screen.findByRole('heading', { name: 'We could not find that appliance' }),
    ).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Back to your appliances' })).toHaveAttribute(
      'href',
      '/',
    )
  })

  it('edits an appliance: the form is filled in, changes are saved and shown', async () => {
    const { user } = await renderApp({ path: `/appliances/${FRIDGE}` })
    await user.click(await screen.findByRole('link', { name: 'Edit' }))
    const name = await screen.findByRole('textbox', { name: /Name/ })
    expect(name).toHaveValue('Kitchen fridge')
    expect(screen.getByRole('combobox', { name: /Type/ })).toHaveDisplayValue('Fridge')
    expect(screen.getByRole('textbox', { name: 'Notes' })).toHaveValue(
      'Bought with a 3 year warranty. Door seal replaced once.',
    )
    await user.clear(name)
    await user.type(name, 'Big fridge')
    await user.clear(screen.getByRole('textbox', { name: 'Location' }))
    await user.click(screen.getByRole('button', { name: 'Save changes' }))
    expect(await screen.findByRole('heading', { level: 1, name: 'Big fridge' })).toBeInTheDocument()
    expect(screen.getByText('Changes saved')).toBeInTheDocument()
    expect(screen.getByText('Fridge')).toBeInTheDocument()
  })

  it('can cancel an edit without saving', async () => {
    const { user } = await renderApp({ path: `/appliances/${FRIDGE}/edit` })
    await user.type(await screen.findByRole('textbox', { name: /Name/ }), ' 2')
    await user.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(
      await screen.findByRole('heading', { level: 1, name: 'Kitchen fridge' }),
    ).toBeInTheDocument()
  })

  it('deletes only after confirming, then returns home without the appliance', async () => {
    const { user } = await renderApp({ path: `/appliances/${WASHER}` })
    await user.click(await screen.findByRole('button', { name: 'Delete' }))
    const dialog = await screen.findByRole('dialog', { name: 'Delete Washing machine?' })
    expect(dialog).toHaveTextContent('cannot be undone')
    await user.click(within(dialog).getByRole('button', { name: 'Cancel' }))
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    expect(screen.getByRole('heading', { level: 1, name: 'Washing machine' })).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Delete' }))
    await user.click(
      within(await screen.findByRole('dialog')).getByRole('button', { name: 'Delete appliance' }),
    )
    expect(await screen.findByRole('heading', { level: 1, name: 'Home' })).toBeInTheDocument()
    expect(await screen.findByText('Appliance deleted')).toBeInTheDocument()
    await screen.findByRole('link', { name: 'Kitchen fridge' })
    expect(screen.queryByRole('link', { name: 'Washing machine' })).not.toBeInTheDocument()
  })

  it('restarts learning after confirmation, which closes the alerts judged on the old baseline', async () => {
    const { user } = await renderApp({ path: `/appliances/${FRIDGE}` })
    await user.click(await screen.findByRole('button', { name: 'Relearn baseline' }))
    const dialog = await screen.findByRole('dialog', { name: "Relearn this appliance's normal?" })
    await user.click(within(dialog).getByRole('button', { name: 'Relearn baseline' }))
    expect(await screen.findByText('Learning restarted')).toBeInTheDocument()
    await waitFor(() =>
      expect(screen.getByText(/We are learning what normal looks like/)).toBeInTheDocument(),
    )
    expect(
      screen.getByText('No active alerts. We will list anything unusual here.'),
    ).toBeInTheDocument()
  })
})
