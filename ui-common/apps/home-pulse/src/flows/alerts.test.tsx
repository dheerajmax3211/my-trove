import { screen, waitFor, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { renderApp } from '../test/setup'

const FRIDGE = '00000000-0000-4000-8000-000000000001'
const AC = '00000000-0000-4000-8000-000000000002'

const alertItems = async () =>
  Array.from((await screen.findByRole('list', { name: 'Alerts' })).children)

describe('alerts inbox', () => {
  it('lists the alerts that need attention, newest first, each with severity and status', async () => {
    await renderApp({ path: '/alerts' })
    const items = await alertItems()
    expect(items).toHaveLength(3)
    expect(within(items[0] as HTMLElement).getByText('Critical')).toBeInTheDocument()
    expect(within(items[0] as HTMLElement).getByText('Stuck on')).toBeInTheDocument()
    expect(within(items[1] as HTMLElement).getByText('Warning')).toBeInTheDocument()
    expect(within(items[2] as HTMLElement).getByText('Acknowledged')).toBeInTheDocument()
    expect(screen.getByRole('status')).toHaveTextContent('3 alerts')
  })

  it('explains the evidence in plain words, with what to do and the warranty angle', async () => {
    await renderApp({ path: '/alerts' })
    const card = (await screen.findByRole('group', { name: /draws 14% more power/ })).closest(
      'li',
    ) as HTMLElement
    expect(within(card).getByRole('heading', { level: 2 })).toHaveTextContent(
      'Kitchen fridge draws 14% more power than its normal while running.',
    )
    expect(
      within(card).getByText('Normal running power: 120 W. Recently: 137 W.'),
    ).toBeInTheDocument()
    expect(
      within(card).getByText(/Seen in each of the last 3 hours, compared with what is normal/),
    ).toBeInTheDocument()
    // the seeded power alert was decided by ml-service; the alert detail says so
    expect(within(card).getByText(/Detected by the learned model/)).toBeInTheDocument()
    expect(within(card).getByText(/What to do/)).toBeInTheDocument()
    expect(
      within(card).getByText(/Still under warranty until .* \(85 days left\)/),
    ).toBeInTheDocument()
    expect(within(card).getByText('Opened 1 day ago', { exact: false })).toBeInTheDocument()
    expect(within(card).getByRole('link', { name: 'Kitchen fridge' })).toHaveAttribute(
      'href',
      `/appliances/${FRIDGE}`,
    )
  })

  it('keeps the raw evidence available under technical details', async () => {
    const { user } = await renderApp({ path: '/alerts' })
    const card = await screen.findByRole('group', { name: /draws 14% more power/ })
    await user.click(within(card).getByText('Technical details'))
    expect(within(card).getByText(/"changePct": 14/)).toBeInTheDocument()
  })

  it('acknowledges an open alert: the button goes, the status changes, a toast confirms', async () => {
    const { user } = await renderApp({ path: '/alerts' })
    const card = await screen.findByRole('group', { name: /draws 14% more power/ })
    await user.click(
      within(card).getByRole('button', { name: 'Acknowledge alert for Kitchen fridge' }),
    )
    expect(await screen.findByText('Alert acknowledged')).toBeInTheDocument()
    await waitFor(() => expect(within(card).getByText('Acknowledged')).toBeInTheDocument())
    expect(
      within(card).queryByRole('button', { name: /Acknowledge alert/ }),
    ).not.toBeInTheDocument()
  })

  it('a new alert appears in the inbox, explained from its evidence, then is acknowledged', async () => {
    const { mock, user } = await renderApp({ path: '/reminders' })
    await screen.findByRole('heading', { level: 1, name: 'Reminders' })
    mock.addAlert({
      applianceId: AC,
      kind: 'POWER_SHIFT',
      severity: 'CRITICAL',
      message: 'Running power is 31% higher than its learned normal (1180 W vs 900 W).',
      evidence: {
        baselineWatts: 900,
        currentWatts: 1179,
        changePct: 31,
        windowHours: 6,
        windowsDeviating: 4,
      },
    })
    await user.click(screen.getAllByRole('link', { name: /^Alerts/ })[0] as HTMLElement)
    const card = await screen.findByRole('group', {
      name: 'Living room AC draws 31% more power than its normal while running.',
    })
    expect(within(card).getByText('Critical')).toBeInTheDocument()
    expect(
      within(card).getByText('Normal running power: 900 W. Recently: 1,179 W.'),
    ).toBeInTheDocument()
    await user.click(within(card).getByRole('button', { name: /Acknowledge/ }))
    await waitFor(() => expect(within(card).getByText('Acknowledged')).toBeInTheDocument())
  })

  it('filters by status', async () => {
    const { user } = await renderApp({ path: '/alerts' })
    await alertItems()
    const filter = screen.getByRole('combobox', { name: 'Show' })

    await user.selectOptions(filter, 'Open')
    await waitFor(async () => expect(await alertItems()).toHaveLength(2))

    await user.selectOptions(filter, 'Acknowledged')
    await waitFor(async () => expect(await alertItems()).toHaveLength(1))
    expect(screen.getByText(/runs 18% more of the time than normal/)).toBeInTheDocument()

    await user.selectOptions(filter, 'Resolved')
    await waitFor(() =>
      expect(
        screen.getByText(/No readings from Garden water pump for 2 h 10 min/),
      ).toBeInTheDocument(),
    )
    expect(screen.getByText('Resolved', { selector: 'span' })).toBeInTheDocument()

    await user.selectOptions(filter, 'All, with history')
    await waitFor(async () => expect(await alertItems()).toHaveLength(4))
  })

  it('shows an encouraging empty state when nothing needs attention', async () => {
    const { user } = await renderApp({ seed: 'empty', path: '/alerts' })
    expect(
      await screen.findByRole('heading', { name: 'Nothing needs your attention' }),
    ).toBeInTheDocument()
    await user.selectOptions(screen.getByRole('combobox', { name: 'Show' }), 'Resolved')
    expect(await screen.findByRole('heading', { name: 'No resolved alerts' })).toBeInTheDocument()
  })

  it('can be narrowed to one appliance from its page, and cleared', async () => {
    const { user } = await renderApp({ path: `/alerts?appliance=${AC}` })
    expect(await screen.findByText(/Showing alerts for/)).toHaveTextContent('Living room AC')
    expect(
      await screen.findByRole('heading', { name: 'Nothing needs your attention' }),
    ).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Show all appliances' }))
    expect(await alertItems()).toHaveLength(3)
    expect(screen.queryByText(/Showing alerts for/)).not.toBeInTheDocument()
  })

  it('reports a failure to load and a failure to acknowledge', async () => {
    const { user, mock } = await renderApp({ path: '/alerts' })
    const card = await screen.findByRole('group', { name: /draws 14% more power/ })
    mock.failNext(
      `POST /v1/alerts/00000000-0000-4000-8000-000000000201/ack`,
      409,
      'Alert is already resolved',
    )
    await user.click(within(card).getByRole('button', { name: /Acknowledge/ }))
    expect(await screen.findByText('Could not acknowledge')).toBeInTheDocument()
    expect(screen.getByText('Alert is already resolved')).toBeInTheDocument()
    expect(within(card).getByRole('button', { name: /Acknowledge/ })).toBeEnabled()
  })
})
