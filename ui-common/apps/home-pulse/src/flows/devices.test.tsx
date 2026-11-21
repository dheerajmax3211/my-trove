import { screen, waitFor, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { renderApp } from '../test/setup'

const row = async (name: RegExp) =>
  within(await screen.findByRole('table', { name: 'Devices' })).getByRole('row', { name })

describe('devices', () => {
  it('lists every device with its appliance, token prefix, status and last seen', async () => {
    await renderApp({ path: '/devices' })
    const table = await screen.findByRole('table', { name: 'Devices' })
    await waitFor(() => expect(within(table).getAllByRole('row')).toHaveLength(5))
    const pump = within(table).getByRole('row', { name: /Pump sensor/ })
    expect(within(pump).getByText('Active')).toBeInTheDocument()
    expect(within(pump).getByRole('link', { name: 'Garden water pump' })).toBeInTheDocument()
    expect(within(pump).getByText('hpd_seeded...')).toBeInTheDocument()
    expect(within(pump).getByText(/Just now|min ago/)).toBeInTheDocument()
    const old = within(table).getByRole('row', { name: /Old pump sensor/ })
    expect(within(old).getByText('Revoked')).toBeInTheDocument()
    expect(within(old).queryByRole('button', { name: /Revoke/ })).not.toBeInTheDocument()
  })

  it('revokes only after confirming, then shows the device as revoked and frees the appliance', async () => {
    const { user } = await renderApp({ path: '/devices' })
    const pump = await row(/^Pump sensor/)
    await user.click(within(pump).getByRole('button', { name: 'Revoke Pump sensor' }))

    const dialog = await screen.findByRole('dialog', { name: 'Revoke Pump sensor?' })
    expect(dialog).toHaveTextContent('stops being accepted immediately')
    await user.click(within(dialog).getByRole('button', { name: 'Cancel' }))
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    expect(within(await row(/^Pump sensor/)).getByText('Active')).toBeInTheDocument()

    await user.click(
      within(await row(/^Pump sensor/)).getByRole('button', { name: 'Revoke Pump sensor' }),
    )
    await user.click(
      within(await screen.findByRole('dialog')).getByRole('button', { name: 'Revoke device' }),
    )
    expect(await screen.findByText('Device revoked')).toBeInTheDocument()
    await waitFor(() =>
      expect(
        within(screen.getByRole('row', { name: /^Pump sensor/ })).getByText('Revoked'),
      ).toBeInTheDocument(),
    )
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()

    // The pump can now take a replacement device.
    await user.click(screen.getByRole('button', { name: 'Register device' }))
    const register = await screen.findByRole('dialog', { name: 'Register a device' })
    expect(
      within(register)
        .getAllByRole('option')
        .map((o) => o.textContent),
    ).toContain('Garden water pump')
  })

  it('tells the person when revoking fails and keeps the dialog open to retry', async () => {
    const { user, mock } = await renderApp({ path: '/devices' })
    mock.failNext(
      'DELETE /v1/devices/00000000-0000-4000-8000-000000000102',
      404,
      'Device not found',
    )
    await user.click(
      within(await row(/^AC wall plug/)).getByRole('button', { name: 'Revoke AC wall plug' }),
    )
    await user.click(
      within(await screen.findByRole('dialog')).getByRole('button', { name: 'Revoke device' }),
    )
    const dialog = await screen.findByRole('dialog')
    expect(await within(dialog).findByRole('alert')).toHaveTextContent('Device not found')
    await user.click(within(dialog).getByRole('button', { name: 'Cancel' }))
    expect(within(await row(/^AC wall plug/)).getByText('Active')).toBeInTheDocument()
  })

  it('can sort by the status column with the keyboard', async () => {
    const { user } = await renderApp({ path: '/devices' })
    await row(/^Pump sensor/)
    await user.click(screen.getByRole('button', { name: /Device/ }))
    const names = within(screen.getByRole('table', { name: 'Devices' }))
      .getAllByRole('row')
      .slice(1)
      .map((r) => within(r).getAllByRole('cell')[0]?.textContent)
    expect(names).toEqual([
      'AC wall plug',
      'Old pump sensor',
      'Plug behind the fridge',
      'Pump sensor',
    ])
  })

  it('asks for an appliance first when there are none', async () => {
    await renderApp({ seed: 'empty', path: '/devices' })
    expect(
      await screen.findByRole('heading', { name: 'Add an appliance first' }),
    ).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Add an appliance' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Register device' })).not.toBeInTheDocument()
  })

  it('reports devices that fail to load', async () => {
    const { mock, user } = await renderApp({ path: '/devices' })
    await row(/^Pump sensor/)
    mock.failNext('GET /v1/appliances/00000000-0000-4000-8000-000000000001/devices', 403, 'Nope')
    await user.click(screen.getByRole('link', { name: 'Reminders' }))
    await user.click(screen.getByRole('link', { name: 'Devices' }))
    expect(
      await screen.findByRole('heading', { name: 'Could not load devices' }),
    ).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Try again' }))
    await row(/^Pump sensor/)
  })
})
