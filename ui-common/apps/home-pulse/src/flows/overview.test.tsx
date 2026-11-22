import { screen, waitFor, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { applianceCard, renderApp } from '../test/setup'

describe('home overview', () => {
  it('shows each appliance with its status, current draw, last seen and open alerts', async () => {
    await renderApp()
    expect(await screen.findByRole('heading', { level: 1, name: 'Home' })).toBeInTheDocument()

    const fridge = await applianceCard('Kitchen fridge')
    await within(fridge).findByText('Watch')
    expect(within(fridge).getByText('Fridge, Kitchen')).toBeInTheDocument()
    await waitFor(() =>
      expect(fridge.querySelector('.hp-draw-value')).toHaveTextContent(/^\d+(\.\d)?\s?W$/),
    )
    expect(within(fridge).getByText(/Just now|min ago/)).toBeInTheDocument()
    const alerts = within(fridge).getByText('Open alerts').nextElementSibling
    expect(alerts).toHaveTextContent('1')
    expect(alerts).toHaveTextContent('+1 acknowledged')

    const pump = await applianceCard('Garden water pump')
    expect(await within(pump).findByText('Alert')).toBeInTheDocument()

    const ac = await applianceCard('Living room AC')
    expect(await within(ac).findByText('Healthy')).toBeInTheDocument()
    expect(within(ac).getByText('Open alerts').nextElementSibling).toHaveTextContent('0')

    const washer = await applianceCard('Washing machine')
    expect(await within(washer).findAllByText('No device')).toHaveLength(2)
    expect(within(washer).getByText('Current draw').nextElementSibling).toHaveTextContent(
      'No device',
    )
    expect(within(washer).getByText('Last seen').nextElementSibling).toHaveTextContent('Never')
  })

  it('links every card to its appliance and has the add action up top', async () => {
    await renderApp()
    const link = await screen.findByRole('link', { name: 'Kitchen fridge' })
    expect(link).toHaveAttribute('href', '/appliances/00000000-0000-4000-8000-000000000001')
    expect(screen.getByRole('link', { name: 'Add appliance' })).toHaveAttribute(
      'href',
      '/appliances/new',
    )
  })

  it('explains how to get started when there are no appliances', async () => {
    await renderApp({ seed: 'empty' })
    expect(
      await screen.findByRole('heading', { name: 'Add your first appliance' }),
    ).toBeInTheDocument()
    // The guide explains how a plug becomes a baseline and what an alert means.
    const steps = screen.getByRole('list', { name: 'How Home Pulse works' })
    expect(within(steps).getByText('Register a smart plug')).toBeInTheDocument()
    expect(within(steps).getByText(/one-time token/)).toBeInTheDocument()
    expect(within(steps).getByText(/baseline: what normal looks like/)).toBeInTheDocument()
    expect(within(steps).getByText(/an alert that says what changed/)).toBeInTheDocument()
    expect(
      screen.getByText(/The shaded band is what Home Pulse learned as normal/),
    ).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Add an appliance' })).toHaveAttribute(
      'href',
      '/appliances/new',
    )
  })

  it('shows a loading state first', async () => {
    let release: () => void = () => {}
    const gate = new Promise<void>((resolve) => {
      release = resolve
    })
    await renderApp({ gate })
    expect(screen.getByRole('status', { name: 'Loading appliances' })).toHaveAttribute(
      'aria-busy',
      'true',
    )
    release()
    await applianceCard('Kitchen fridge')
    expect(screen.queryByRole('status', { name: 'Loading appliances' })).not.toBeInTheDocument()
  })

  it('says what went wrong and retries', async () => {
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
    await user.click(within(alert).getByRole('button', { name: 'Try again' }))
    expect(
      await screen.findByRole('heading', { name: 'Add your first appliance' }),
    ).toBeInTheDocument()
  })

  it('has the page landmarks: banner nav, main and one h1', async () => {
    await renderApp()
    await applianceCard('Kitchen fridge')
    expect(screen.getByRole('main')).toBeInTheDocument()
    expect(screen.getAllByRole('navigation', { name: 'Primary' }).length).toBeGreaterThan(0)
    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1)
    await waitFor(() => expect(document.title).toBe('Home - Home Pulse'))
  })
})
