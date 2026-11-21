import { screen, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { generateVaultKey } from '../../crypto'
import { MockBackend } from '../../mock/backend'
import { createHarness, DAY_MS } from '../../testing/harness'
import { renderApp, setupBrowserStubs } from '../../testing/render'
import { armedScenario, sampleDocument } from '../../testing/scenario'
import { saveVault } from '../vault/vaultService'

setupBrowserStubs()

async function bareVault() {
  const backend = new MockBackend()
  const h = createHarness(backend)
  await saveVault(h.owner, generateVaultKey(), sampleDocument, 'create')
  return { backend, h }
}

describe('check-in policy page', () => {
  it('starts from a sensible default with your email, and shows the live preview', async () => {
    const { backend } = await bareVault()
    renderApp('/policy', { mock: backend })
    expect(await screen.findByLabelText('Check in every')).toHaveValue('7')
    expect(screen.getByLabelText('Contact 1 address')).toHaveValue('demo@example.test')
    expect(screen.getByText(/20 days/)).toBeInTheDocument()
    const bar = screen.getByRole('list', { name: 'Phases of the switch, in order' })
    expect(
      within(bar)
        .getAllByRole('listitem')
        .map((li) => li.textContent),
    ).toEqual(['Quiet', 'Grace', 'Reminders', 'Approval and cool-off'])
  })

  it('updates the timeline preview as you type and saves the policy', async () => {
    const { backend, h } = await bareVault()
    const r = renderApp('/policy', { mock: backend })
    const interval = await screen.findByLabelText('Check in every')
    await r.user.clear(interval)
    await r.user.type(interval, '14')
    expect(screen.getByText(/27 days/)).toBeInTheDocument() // 14 + 3 grace + 7 reminders + 3 cool-off
    await r.user.click(screen.getByRole('button', { name: 'Save policy' }))
    expect(await screen.findByText('Policy saved')).toBeInTheDocument()
    const saved = (await h.owner.getState()).policy
    expect(saved?.checkInIntervalSeconds).toBe(14 * 86400)
    expect(saved?.ownerContacts).toEqual([{ channel: 'EMAIL', address: 'demo@example.test' }])
  })

  it('catches mistakes before sending anything', async () => {
    const { backend } = await bareVault()
    const r = renderApp('/policy', { mock: backend })
    const interval = await screen.findByLabelText('Check in every')
    await r.user.clear(interval)
    await r.user.type(interval, 'abc')
    await r.user.clear(screen.getByLabelText('Contact 1 address'))
    const before = backend.requests.length
    await r.user.click(screen.getByRole('button', { name: 'Save policy' }))
    expect(await screen.findByText('Enter the check-in interval as a number.')).toBeInTheDocument()
    expect(screen.getByText('Enter an address.')).toBeInTheDocument()
    expect(backend.requests.slice(before).some((q) => q.method === 'PUT')).toBe(false)
  })

  it('validates the reminder schedule: order, urgency and channels', async () => {
    const { backend } = await bareVault()
    const r = renderApp('/policy', { mock: backend })
    await r.user.click(await screen.findByRole('button', { name: 'Add a reminder' }))
    const offset = screen.getByLabelText('Reminder 5 sent after')
    await r.user.clear(offset)
    await r.user.type(offset, '1')
    await r.user.click(screen.getByRole('checkbox', { name: 'Email (reminder 5)' }))
    await r.user.click(screen.getByRole('button', { name: 'Save policy' }))
    expect(
      await screen.findByText('Each step must come after the one before it.'),
    ).toBeInTheDocument()
    expect(screen.getByText('Pick at least one way to reach them.')).toBeInTheDocument()
    await r.user.click(screen.getByRole('button', { name: 'Remove reminder 5' }))
    expect(screen.queryByLabelText('Reminder 5 sent after')).not.toBeInTheDocument()
  })

  it("shows the server's reasons when it refuses, such as a quorum above the trustee count", async () => {
    const { backend, h } = await bareVault()
    await h.owner.invite('Only one')
    const r = renderApp('/policy', { mock: backend })
    await screen.findByLabelText('Check in every')
    await r.user.click(screen.getByRole('button', { name: 'Save policy' }))
    expect(await screen.findByText('Policy saved')).toBeInTheDocument()
    expect((await h.owner.getState()).policy?.quorum).toBe(1)
  })

  it('is read-only while the switch is not quiet, with the reason', async () => {
    const s = await armedScenario()
    s.h.backend.advance(8 * DAY_MS)
    renderApp('/policy', { mock: s.h.backend })
    expect(await screen.findByText('The policy is read-only right now')).toBeInTheDocument()
    expect(screen.getByLabelText('Check in every')).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Save policy' })).toBeDisabled()
  })

  it('restarts the interval when an armed policy is saved, and says so', async () => {
    const s = await armedScenario()
    const r = renderApp('/policy', { mock: s.h.backend })
    await screen.findByLabelText('Check in every')
    await r.user.click(screen.getByRole('button', { name: 'Save policy' }))
    expect(
      await screen.findByText('Your check-in interval restarted from now.'),
    ).toBeInTheDocument()
  })
})
