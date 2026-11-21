import { screen, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { applianceCard, createAppliance, renderApp } from '../test/setup'

describe('home states', () => {
  it('first run: explains the product and offers the one next step', async () => {
    await renderApp({ seed: 'empty' })
    expect(
      await screen.findByRole('heading', { level: 2, name: 'Add your first appliance' }),
    ).toBeInTheDocument()
    expect(screen.queryByRole('region', { name: /normally|attention/ })).not.toBeInTheDocument()
    // no "Add appliance" button in the header: the guide has the only action
    expect(screen.queryByRole('link', { name: 'Add appliance' })).not.toBeInTheDocument()
    expect(screen.getAllByRole('link', { name: 'Add an appliance' })).toHaveLength(1)
  })

  it('all well: a calm panel and the appliance, without an alert in sight', async () => {
    await renderApp({
      seed: 'empty',
      prepare: async (mock) => {
        await createAppliance(mock, { name: 'Chest freezer', type: 'FRIDGE', location: 'Garage' })
      },
    })
    const panel = await screen.findByRole('region', { name: 'Everything is running normally' })
    expect(panel).toHaveAttribute('data-state', 'well')
    expect(within(panel).getByText(/No appliance has drifted/)).toBeInTheDocument()
    expect(within(panel).queryByRole('link', { name: /Review/ })).not.toBeInTheDocument()
    const card = await applianceCard('Chest freezer')
    // no device yet: the card says so in a sentence and offers nothing alarming
    expect(await within(card).findByText(/No device yet/)).toBeInTheDocument()
    expect(screen.queryByRole('list', { name: 'Recent alerts' })).not.toBeInTheDocument()
  })

  it('all well, with an acknowledged alert still on watch', async () => {
    await renderApp({
      seed: 'empty',
      prepare: async (mock) => {
        const id = await createAppliance(mock, { name: 'Chest freezer', type: 'FRIDGE' })
        mock.addAlert({
          applianceId: id,
          kind: 'POWER_SHIFT',
          severity: 'WARNING',
          status: 'ACKNOWLEDGED',
          message: 'Running power is higher.',
          evidence: {},
        })
      },
    })
    const panel = await screen.findByRole('region', { name: 'Everything is running normally' })
    expect(within(panel).getByText(/1 acknowledged alert still on watch/)).toBeInTheDocument()
    expect(within(panel).getByRole('link', { name: 'See acknowledged' })).toHaveAttribute(
      'href',
      '/alerts?status=ACKNOWLEDGED',
    )
  })

  it('needs attention: names the one appliance and links to its page', async () => {
    let id = ''
    await renderApp({
      seed: 'empty',
      prepare: async (mock) => {
        id = await createAppliance(mock, { name: 'Chest freezer', type: 'FRIDGE' })
        mock.addAlert({
          applianceId: id,
          kind: 'STUCK_ON',
          severity: 'WARNING',
          message: 'Has been running non-stop.',
          evidence: { runMinutes: 300, longestNormalRunMinutes: 14 },
        })
      },
    })
    const panel = await screen.findByRole('region', { name: 'Chest freezer needs attention' })
    expect(panel).toHaveAttribute('data-state', 'attention')
    expect(within(panel).getByText(/running non-stop for 5 h/)).toBeInTheDocument()
    expect(within(panel).getByRole('link', { name: 'Review the alert' })).toHaveAttribute(
      'href',
      '/alerts',
    )
    expect(within(panel).getByRole('link', { name: 'Open Chest freezer' })).toHaveAttribute(
      'href',
      `/appliances/${id}`,
    )
  })

  it('needs attention with several alerts: critical leads, the rest are counted', async () => {
    await renderApp()
    const panel = await screen.findByRole('region', { name: '2 alerts need your attention' })
    expect(panel).toHaveAttribute('data-state', 'critical')
    // the pump's stuck-on alert is critical, so it leads
    expect(
      within(panel).getByText(/Garden water pump has been running non-stop/),
    ).toBeInTheDocument()
    expect(within(panel).getByText(/One other alert is open/)).toBeInTheDocument()
    // the cards needing a look come first
    const names = (await screen.findAllByRole('heading', { level: 2 })).map((h) => h.textContent)
    expect(names.indexOf('Washing machine')).toBeGreaterThan(names.indexOf('Kitchen fridge'))
    // alert history reads as a timeline
    const timeline = await screen.findByRole('list', { name: 'Recent alerts' })
    expect(within(timeline).getAllByRole('listitem').length).toBeGreaterThanOrEqual(3)
  })

  it('each card shows a one-line status and a live trend', async () => {
    await renderApp()
    const ac = await applianceCard('Living room AC')
    expect(await within(ac).findByText('Running normally.')).toBeInTheDocument()
    expect(
      await within(ac).findByRole('img', { name: 'Average draw per hour, last 24 hours' }),
    ).toBeInTheDocument()
    const washer = await applianceCard('Washing machine')
    expect(await within(washer).findByText(/No device yet/)).toBeInTheDocument()
    expect(within(washer).queryByRole('img')).not.toBeInTheDocument()
    const fridge = await applianceCard('Kitchen fridge')
    expect(await within(fridge).findByText(/Draws 14% more power/)).toBeInTheDocument()
    // warranty and service dates sit on the card
    expect(within(fridge).getByText('Warranty')).toBeInTheDocument()
    expect(within(fridge).getByText('Next service')).toBeInTheDocument()
  })

  it('error: a failed appliance list says so and retries into the first-run guide', async () => {
    let release: () => void = () => {}
    const gate = new Promise<void>((resolve) => {
      release = resolve
    })
    const { mock, user } = await renderApp({ seed: 'empty', gate })
    mock.failNext('GET /v1/appliances', 403, 'Not allowed')
    release()
    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent('Could not load your appliances')
    expect(alert).toHaveTextContent('Not allowed')
    expect(screen.queryByRole('region', { name: /normally|attention/ })).not.toBeInTheDocument()
    await user.click(within(alert).getByRole('button', { name: 'Try again' }))
    expect(
      await screen.findByRole('heading', { name: 'Add your first appliance' }),
    ).toBeInTheDocument()
  })
})
