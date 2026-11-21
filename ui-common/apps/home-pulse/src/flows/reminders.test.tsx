import { screen, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { renderApp } from '../test/setup'

describe('reminders', () => {
  it('orders reminders by priority: anomalies first, then the soonest', async () => {
    await renderApp({ path: '/reminders' })
    const list = await screen.findByRole('list', { name: 'Reminders by priority' })
    const items = within(list).getAllByRole('listitem')
    expect(items).toHaveLength(4)
    const text = items.map((i) => i.textContent ?? '')
    expect(text[0]).toContain('Garden water pump')
    expect(text[0]).toContain('Service overdue')
    expect(text[0]).toContain('High priority')
    expect(text[0]).toContain('12 days overdue')
    expect(text[0]).toContain(
      'Service was due 12 day(s) ago and the appliance is showing an anomaly.',
    )
    expect(text[1]).toContain('Kitchen fridge')
    expect(text[1]).toContain('Service due')
    expect(text[2]).toContain('Claim window')
    expect(text[2]).toContain('get it checked before it expires')
    expect(text[3]).toContain('Living room AC')
    expect(text[3]).not.toContain('High priority')
    expect(text[3]).toContain('in 20 days')
  })

  it('links each reminder to its appliance', async () => {
    await renderApp({ path: '/reminders' })
    const link = await screen.findByRole('link', { name: 'Living room AC' })
    expect(link).toHaveAttribute('href', '/appliances/00000000-0000-4000-8000-000000000002')
  })

  it('has an empty state that says how to get reminders', async () => {
    await renderApp({ seed: 'empty', path: '/reminders' })
    expect(await screen.findByRole('heading', { name: 'Nothing due soon' })).toBeInTheDocument()
    expect(screen.getByText(/Add service and warranty dates/)).toBeInTheDocument()
  })

  it('reports a failure and retries', async () => {
    const { mock, user } = await renderApp({ path: '/' })
    await screen.findByRole('link', { name: 'Kitchen fridge' })
    mock.failNext('GET /v1/reminders', 503)
    await user.click(screen.getByRole('link', { name: 'Reminders' }))
    expect(
      await screen.findByRole('heading', { name: 'Could not load reminders' }),
    ).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Try again' }))
    expect(await screen.findByRole('list', { name: 'Reminders by priority' })).toBeInTheDocument()
  })
})
