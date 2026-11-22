import { screen, waitFor, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { renderApp } from '../test/setup'

const WASHER = '00000000-0000-4000-8000-000000000004'
const FRIDGE = '00000000-0000-4000-8000-000000000001'

const card = () => screen.findByRole('heading', { name: 'Enter readings yourself' })

describe('entering readings by hand', () => {
  it('turns two meter totals into average power, and labels every chart and badge as entered by hand', async () => {
    const { user } = await renderApp({ path: `/appliances/${WASHER}` })
    await card()

    await user.type(screen.getByRole('spinbutton', { name: /Total energy on the meter/ }), '100')
    await user.type(screen.getByLabelText(/When you read it/), '2026-11-19T10:00')
    await user.click(screen.getByRole('button', { name: 'Save reading' }))
    expect(await screen.findByText(/Saved as the starting point/)).toBeInTheDocument()

    await user.type(screen.getByRole('spinbutton', { name: /Total energy on the meter/ }), '100.5')
    await user.type(screen.getByLabelText(/When you read it/), '2026-11-19T10:30')
    await user.click(screen.getByRole('button', { name: 'Save reading' }))
    expect(
      await screen.findByText('Added 30 minutes at an average of 1,000 W (0.5 kWh over 30 min).'),
    ).toBeInTheDocument()

    // the chart says where its numbers come from, and the header badge agrees
    expect(await screen.findByText(/Entered by you, last 24 hours/)).toBeInTheDocument()
    expect((await screen.findAllByText('Entered by you')).length).toBeGreaterThan(0)
    expect(screen.queryByText(/reported by the smart plug/)).not.toBeInTheDocument()
  })

  it('imports pasted rows, reports duplicates on a second import, and refuses a file with a bad line', async () => {
    const { user } = await renderApp({ path: `/appliances/${WASHER}` })
    await card()
    const rows = screen.getByRole('textbox', { name: /Rows: timestamp,watts/ })

    await user.click(rows)
    await user.paste('2026-11-19T11:00:00Z,120\n2026-11-19T11:01:00Z,121')
    await user.click(screen.getByRole('button', { name: 'Import rows' }))
    expect(await screen.findByText('Imported 2 readings.')).toBeInTheDocument()

    await user.click(screen.getByRole('textbox', { name: /Rows: timestamp,watts/ }))
    await user.paste('2026-11-19T11:00:00Z,120')
    await user.click(screen.getByRole('button', { name: 'Import rows' }))
    expect(
      await screen.findByText('Imported 0 readings. 1 reading was already there.'),
    ).toBeInTheDocument()

    await user.click(screen.getByRole('textbox', { name: /Rows: timestamp,watts/ }))
    await user.paste('2026-11-19T11:02:00Z,abc')
    await user.click(screen.getByRole('button', { name: 'Import rows' }))
    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent('Nothing was imported. line 1: watts must be a number')
  })

  it('shows the service refusal when a total would go down, and keeps the card usable', async () => {
    const { user } = await renderApp({ path: `/appliances/${WASHER}` })
    await card()
    await user.type(screen.getByRole('spinbutton', { name: /Total energy on the meter/ }), '50')
    await user.type(screen.getByLabelText(/When you read it/), '2026-11-19T10:00')
    await user.click(screen.getByRole('button', { name: 'Save reading' }))
    await screen.findByText(/Saved as the starting point/)

    await user.type(screen.getByRole('spinbutton', { name: /Total energy on the meter/ }), '40')
    await user.type(screen.getByLabelText(/When you read it/), '2026-11-19T10:30')
    await user.click(screen.getByRole('button', { name: 'Save reading' }))
    expect(await screen.findByRole('alert')).toHaveTextContent(/total is lower than the last one/)
    expect(screen.getByRole('button', { name: 'Save reading' })).toBeEnabled()
  })

  it('asks for a kWh figure before sending anything', async () => {
    const { user } = await renderApp({ path: `/appliances/${WASHER}` })
    await card()
    await user.click(screen.getByRole('button', { name: 'Save reading' }))
    expect(await screen.findByText(/Enter the total from the meter in kWh/)).toBeInTheDocument()
  })

  it('does not offer manual entry on an appliance that a live plug feeds', async () => {
    await renderApp({ path: `/appliances/${FRIDGE}` })
    expect(await screen.findByRole('heading', { name: 'Power draw' })).toBeInTheDocument()
    await waitFor(() =>
      expect(
        screen.queryByRole('heading', { name: 'Enter readings yourself' }),
      ).not.toBeInTheDocument(),
    )
  })

  it('lists manual entries on the devices page without a token, and stops them after confirming', async () => {
    const { user } = await renderApp({ path: `/appliances/${WASHER}` })
    await card()
    await user.type(screen.getByRole('spinbutton', { name: /Total energy on the meter/ }), '10')
    await user.click(screen.getByRole('button', { name: 'Save reading' }))
    await screen.findByText(/Saved as the starting point/)

    await user.click(screen.getByRole('button', { name: 'Stop entering readings' }))
    const dialog = await screen.findByRole('dialog', {
      name: 'Stop entering readings for Washing machine?',
    })
    expect(dialog).toHaveTextContent('Readings already entered are kept')
    await user.click(within(dialog).getByRole('button', { name: 'Stop entering readings' }))
    expect(await screen.findByText('Stopped entering readings')).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Enter readings yourself' })).toBeInTheDocument()
  })

  it('shows the manual device on the devices page with no token', async () => {
    const { user } = await renderApp({ path: `/appliances/${WASHER}` })
    await card()
    await user.type(screen.getByRole('spinbutton', { name: /Total energy on the meter/ }), '10')
    await user.click(screen.getByRole('button', { name: 'Save reading' }))
    await screen.findByText(/Saved as the starting point/)

    await user.click(screen.getByRole('link', { name: 'Devices' }))
    const table = await screen.findByRole('table', { name: 'Devices' })
    const row = await waitFor(() => within(table).getByRole('row', { name: /Entered by you/ }))
    expect(within(row).getByText('No token')).toBeInTheDocument()
    expect(
      within(row).getByRole('button', { name: 'Stop entering readings for Washing machine' }),
    ).toBeInTheDocument()
  })
})
