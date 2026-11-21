import { screen, waitFor, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { renderApp } from '../test/setup'

describe('first-run flow: add an appliance, connect a device, read the chart', () => {
  it('goes from an empty account to a chart with readings, switching ranges', async () => {
    const { user } = await renderApp({ seed: 'empty' })

    // 1. Empty state -> add form. Submitting blank shows what is missing and moves focus to the first problem.
    await user.click(await screen.findByRole('link', { name: 'Add an appliance' }))
    expect(
      await screen.findByRole('heading', { level: 1, name: 'Add an appliance' }),
    ).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Add appliance' }))
    expect(await screen.findByText('Enter a name for the appliance.')).toBeInTheDocument()
    expect(screen.getByText('Choose a type.')).toBeInTheDocument()
    expect(screen.getByRole('textbox', { name: /Name/ })).toHaveFocus()
    expect(screen.getByRole('textbox', { name: /Name/ })).toBeInvalid()

    // 2. Fix and submit. Lands on the new appliance with a call to connect a device.
    await user.type(screen.getByRole('textbox', { name: /Name/ }), 'Chest freezer')
    await user.selectOptions(screen.getByRole('combobox', { name: /Type/ }), 'Fridge')
    await user.type(screen.getByRole('textbox', { name: 'Location' }), 'Garage')
    await user.click(screen.getByRole('button', { name: 'Add appliance' }))
    expect(
      await screen.findByRole('heading', { level: 1, name: 'Chest freezer' }),
    ).toBeInTheDocument()
    expect(await screen.findByText('Appliance added')).toBeInTheDocument()
    expect(await screen.findByRole('heading', { name: 'No device connected' })).toBeInTheDocument()
    expect(screen.getAllByText('No device').length).toBeGreaterThan(0)

    // 3. Connect a device: the register dialog opens for this appliance.
    await user.click(screen.getByRole('link', { name: 'Connect a device' }))
    const register = await screen.findByRole('dialog', { name: 'Register a device' })
    expect(within(register).getByRole('combobox', { name: /Appliance/ })).toHaveDisplayValue(
      'Chest freezer',
    )
    await user.click(within(register).getByRole('button', { name: 'Register device' }))
    expect(
      await within(register).findByText('Give the device a name you will recognise.'),
    ).toBeInTheDocument()
    await user.type(within(register).getByRole('textbox', { name: /Device name/ }), 'Garage plug')
    await user.click(within(register).getByRole('button', { name: 'Register device' }))

    // 4. The token is shown once, with a warning, copy, and setup snippets.
    const tokenDialog = await screen.findByRole('dialog', { name: 'Copy your ingestion token now' })
    expect(within(tokenDialog).getByRole('alert')).toHaveTextContent(
      'This is the only time you will see this token.',
    )
    const token = within(tokenDialog).getByRole<HTMLInputElement>('textbox', {
      name: 'Ingestion token',
    }).value
    expect(token).toMatch(/^hpd_/)
    await user.click(within(tokenDialog).getByRole('button', { name: 'Copy token' }))
    expect(await within(tokenDialog).findByText('Copied to the clipboard.')).toBeInTheDocument()
    expect(await navigator.clipboard.readText()).toBe(token)

    const curl = within(tokenDialog).getByLabelText('curl example')
    expect(curl).toHaveTextContent('https://hp.example.test/v1/ingest/readings')
    expect(curl).toHaveTextContent(`Authorization: Bearer ${token}`)
    await user.click(within(tokenDialog).getByRole('tab', { name: 'MQTT' }))
    expect(within(tokenDialog).getByLabelText('MQTT example')).toHaveTextContent(
      /topic:\s+homepulse\/[0-9a-f-]+\/reading/,
    )

    // It cannot be closed by accident: Escape does nothing, only the explicit button.
    await user.keyboard('{Escape}')
    expect(
      screen.getByRole('dialog', { name: 'Copy your ingestion token now' }),
    ).toBeInTheDocument()
    await user.click(within(tokenDialog).getByRole('button', { name: 'I have saved the token' }))
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    expect(screen.queryByDisplayValue(token)).not.toBeInTheDocument()
    expect(document.body).not.toHaveTextContent(token)

    // 5. The device is listed, active, and only its prefix is shown.
    const table = await screen.findByRole('table', { name: 'Devices' })
    const row = within(table).getByRole('row', { name: /Garage plug/ })
    expect(within(row).getByText('Active')).toBeInTheDocument()
    expect(within(row).getByText(`${token.slice(0, 10)}...`)).toBeInTheDocument()
    expect(row).not.toHaveTextContent(token)

    // 6. Back on the appliance the chart draws mock readings; ranges switch.
    await user.click(within(row).getByRole('link', { name: 'Chest freezer' }))
    expect(
      await screen.findByRole('img', { name: 'Power draw, last 24 hours' }),
    ).toBeInTheDocument()
    expect(screen.getByRole('slider')).toBeInTheDocument()
    const range = screen.getByRole('group', { name: 'Time range' })
    expect(within(range).getByRole('button', { name: 'Day' })).toHaveAttribute(
      'aria-pressed',
      'true',
    )

    await user.click(within(range).getByRole('button', { name: 'Hour' }))
    expect(await screen.findByRole('img', { name: 'Power draw, last hour' })).toBeInTheDocument()
    expect(within(range).getByRole('button', { name: 'Hour' })).toHaveAttribute(
      'aria-pressed',
      'true',
    )
    expect(screen.queryByText(/Lowest to highest in each interval/)).not.toBeInTheDocument()

    await user.click(within(range).getByRole('button', { name: 'Week' }))
    expect(await screen.findByRole('img', { name: 'Power draw, last 7 days' })).toBeInTheDocument()
    expect(screen.getByText(/Lowest to highest in each interval/)).toBeInTheDocument()

    await user.click(within(range).getByRole('button', { name: 'Month' }))
    expect(await screen.findByRole('img', { name: 'Power draw, last 30 days' })).toBeInTheDocument()
    // The mock plug has only a week of history, so the month shows the missing weeks as a gap.
    expect(screen.getAllByTestId('chart-gap').length).toBeGreaterThan(0)
    expect(screen.getByText(/gap with no data/)).toBeInTheDocument()

    // 7. The new device starts learning.
    expect(await screen.findAllByText('Learning')).not.toHaveLength(0)
  })

  it('shows what the service says when a field is rejected', async () => {
    const { user, mock } = await renderApp({ seed: 'empty', path: '/appliances/new' })
    await user.type(await screen.findByRole('textbox', { name: /Name/ }), 'Freezer')
    await user.selectOptions(screen.getByRole('combobox', { name: /Type/ }), 'Fridge')
    mock.failNext(
      'POST /v1/appliances',
      400,
      'name size must be between 0 and 120; location must not be blank',
    )
    await user.click(screen.getByRole('button', { name: 'Add appliance' }))
    expect(await screen.findByText('Size must be between 0 and 120')).toBeInTheDocument()
    expect(screen.getByRole('textbox', { name: /Name/ })).toBeInvalid()
    expect(screen.getByRole('textbox', { name: /Name/ })).toHaveFocus()
    expect(screen.getByText('Must not be blank')).toBeInTheDocument()
  })

  it('catches a warranty that ends before the purchase, before sending anything', async () => {
    const { user } = await renderApp({ seed: 'empty', path: '/appliances/new' })
    await user.type(await screen.findByRole('textbox', { name: /Name/ }), 'Freezer')
    await user.selectOptions(screen.getByRole('combobox', { name: /Type/ }), 'Fridge')
    await user.type(screen.getByLabelText('Purchase date'), '2026-05-01')
    await user.type(screen.getByLabelText('Warranty ends'), '2026-04-01')
    await user.click(screen.getByRole('button', { name: 'Add appliance' }))
    expect(
      await screen.findByText('The warranty cannot end before the purchase date.'),
    ).toBeInTheDocument()
    expect(screen.getByRole('heading', { level: 1, name: 'Add an appliance' })).toBeInTheDocument()
  })

  it('does not offer an appliance that already has a device, and reports a conflict from the service', async () => {
    const { user, mock } = await renderApp({ path: '/devices' })
    await user.click(await screen.findByRole('button', { name: 'Register device' }))
    const dialog = await screen.findByRole('dialog', { name: 'Register a device' })
    const options = within(dialog)
      .getAllByRole('option')
      .map((o) => o.textContent)
    expect(options).toEqual(['Choose an appliance', 'Washing machine'])
    expect(
      within(dialog).getByText(/already have an active device are left out/),
    ).toBeInTheDocument()

    await user.selectOptions(
      within(dialog).getByRole('combobox', { name: /Appliance/ }),
      'Washing machine',
    )
    await user.type(within(dialog).getByRole('textbox', { name: /Device name/ }), 'Plug')
    mock.failNext(
      'POST /v1/appliances/00000000-0000-4000-8000-000000000004/devices',
      409,
      'Appliance already has an active device; revoke it first to rotate the token',
    )
    await user.click(within(dialog).getByRole('button', { name: 'Register device' }))
    expect(await within(dialog).findByRole('alert')).toHaveTextContent(
      'revoke it first to rotate the token',
    )
  })
})
