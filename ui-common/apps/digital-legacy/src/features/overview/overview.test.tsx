import { screen, waitFor, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { generateVaultKey } from '../../crypto'
import { MockBackend } from '../../mock/backend'
import { createHarness, DAY_MS } from '../../testing/harness'
import { armedScenario, sampleDocument, SECRET_BODY } from '../../testing/scenario'
import { saveVault } from '../vault/vaultService'
import { renderApp, setupBrowserStubs } from '../../testing/render'

setupBrowserStubs()

async function refresh(r: ReturnType<typeof renderApp>) {
  await r.user.click(screen.getByRole('button', { name: 'Refresh status' }))
}

describe('overview', () => {
  it('invites you to create a vault when there is none', async () => {
    renderApp('/')
    expect(
      await screen.findByRole('heading', { name: 'You have no vault yet' }),
    ).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Create your vault' })).toHaveAttribute(
      'href',
      '/vault',
    )
  })

  it('shows a disarmed switch with what is missing before it can be armed', async () => {
    const s = await armedScenario({ arm: false })
    await s.h.owner.disarm()
    renderApp('/', { mock: s.h.backend })
    expect(await screen.findByRole('heading', { name: 'Not armed' })).toBeInTheDocument()
    expect(
      screen.getByText(/Nothing will happen to your vault until you arm it/),
    ).toBeInTheDocument()
    await screen.findByRole('button', { name: 'Arm the switch' })
    expect(screen.getByRole('button', { name: 'Arm the switch' })).toBeEnabled()
  })

  it('lists exactly why the switch cannot be armed yet', async () => {
    const backend = new MockBackend()
    const h = createHarness(backend)
    await saveVault(h.owner, generateVaultKey(), sampleDocument, 'create')
    renderApp('/', { mock: backend })
    expect(await screen.findByText('Not ready to arm yet')).toBeInTheDocument()
    expect(screen.getByText('no check-in policy set')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Arm the switch' })).toBeDisabled()
  })

  it('arms the switch and shows the countdown to the first deadline', async () => {
    const s = await armedScenario({ arm: false })
    const r = renderApp('/', { mock: s.h.backend })
    await r.user.click(await screen.findByRole('button', { name: 'Arm the switch' }))
    expect(await screen.findByRole('heading', { name: 'All quiet' })).toBeInTheDocument()
    expect(screen.getByText('Next check-in due in')).toBeInTheDocument()
    expect(screen.getByRole('timer')).toHaveTextContent(/^06d 2\dh|^6d 2\dh/)
    expect(await screen.findByText('Switch armed')).toBeInTheDocument()
  })

  it('goes through the states as silence passes, and one tap on "I\'m here" restores it from each', async () => {
    const s = await armedScenario()
    const r = renderApp('/', { mock: s.h.backend })
    expect(await screen.findByRole('heading', { name: 'All quiet' })).toBeInTheDocument()

    s.h.backend.advance(8 * DAY_MS)
    await refresh(r)
    expect(await screen.findByRole('heading', { name: 'Check-in missed' })).toBeInTheDocument()
    expect(screen.getByText('Reminders begin in')).toBeInTheDocument()
    expect(screen.getByText('Grace')).toBeInTheDocument()

    s.h.backend.advance(4 * DAY_MS)
    await refresh(r)
    expect(
      await screen.findByRole('heading', { name: 'Reminders are going out' }),
    ).toBeInTheDocument()
    expect(screen.getByText(/Step \d of 4 has been sent/)).toBeInTheDocument()

    s.h.backend.advance(7 * DAY_MS)
    await refresh(r)
    expect(
      await screen.findByRole('heading', { name: 'Waiting for your trustees' }),
    ).toBeInTheDocument()
    expect(screen.getByText('Release pending')).toBeInTheDocument()

    await r.user.click(screen.getByRole('button', { name: "I'm here" }))
    expect(await screen.findByRole('heading', { name: 'All quiet' })).toBeInTheDocument()
    expect(await screen.findByText('Checked in')).toBeInTheDocument()
    expect((await s.h.owner.getState()).state).toBe('ACTIVE')
  })

  it('shows trustee approvals and the cool-off, then the released state with check-in disabled', async () => {
    const s = await armedScenario()
    const r = renderApp('/', { mock: s.h.backend })
    await screen.findByRole('heading', { name: 'All quiet' })
    s.h.backend.advance(17 * DAY_MS + 3600_000)
    await s.trustees[0]?.api.vote('APPROVE')
    await s.trustees[1]?.api.vote('APPROVE')
    await refresh(r)
    expect(
      await screen.findByRole('heading', { name: 'Release approved, cooling off' }),
    ).toBeInTheDocument()
    expect(screen.getByText('Earliest release in')).toBeInTheDocument()
    expect(screen.getByText('2 of 2', { selector: 'dd' })).toBeInTheDocument()

    s.h.backend.advance(3 * DAY_MS + 3600_000)
    await refresh(r)
    expect(await screen.findByRole('heading', { name: 'Released' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: "I'm here" })).toBeDisabled()
    expect(screen.getByText(/can no longer undo it/)).toBeInTheDocument()
    expect(screen.queryByText(SECRET_BODY)).not.toBeInTheDocument()
  })

  it('confirms before disarming', async () => {
    const s = await armedScenario()
    const r = renderApp('/', { mock: s.h.backend })
    await r.user.click(await screen.findByRole('button', { name: 'Disarm' }))
    const dialog = await screen.findByRole('dialog', { name: 'Disarm the switch?' })
    await r.user.click(within(dialog).getByRole('button', { name: 'Keep it armed' }))
    expect((await s.h.owner.getState()).armed).toBe(true)
    await r.user.click(screen.getByRole('button', { name: 'Disarm' }))
    await r.user.click(
      within(await screen.findByRole('dialog')).getByRole('button', { name: 'Disarm the switch' }),
    )
    await waitFor(async () => expect((await s.h.owner.getState()).armed).toBe(false))
    expect(await screen.findByRole('heading', { name: 'Not armed' })).toBeInTheDocument()
  })

  it('shows an error with a retry when the server fails', async () => {
    const s = await armedScenario()
    let fail = true
    const original = s.h.backend.fetch
    ;(s.h.backend as { fetch: typeof fetch }).fetch = (input, init) =>
      fail
        ? Promise.resolve(
            new Response(
              JSON.stringify({ title: 'Boom', status: 500, detail: 'The mock is broken' }),
              { status: 500, headers: { 'content-type': 'application/problem+json' } },
            ),
          )
        : original(input, init)
    const r = renderApp('/', { mock: s.h.backend })
    expect(
      await screen.findByText('The mock is broken', undefined, { timeout: 8000 }),
    ).toBeInTheDocument()
    fail = false
    await r.user.click(screen.getByRole('button', { name: 'Try again' }))
    expect(await screen.findByRole('heading', { name: 'All quiet' })).toBeInTheDocument()
  }, 15000)
})

describe('vacation mode', () => {
  it('states the limits, pauses within them and resumes', async () => {
    const s = await armedScenario()
    const r = renderApp('/', { mock: s.h.backend })
    expect(
      await screen.findByText(
        /Longest single pause: 30 days\. Used this year: 0 seconds of 120 days/,
      ),
    ).toBeInTheDocument()
    await r.user.selectOptions(screen.getByLabelText('Pause for'), '14')
    await r.user.click(screen.getByRole('button', { name: 'Start vacation mode' }))
    expect(await screen.findByRole('heading', { name: 'Paused for vacation' })).toBeInTheDocument()
    expect(screen.getByText('Pause ends in')).toBeInTheDocument()
    expect(screen.getByText(/Used this year: 14 days/)).toBeInTheDocument()

    await r.user.click(screen.getByRole('button', { name: 'End pause now' }))
    expect(await screen.findByRole('heading', { name: 'All quiet' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Start vacation mode' })).toBeInTheDocument()
  })

  it('only offers pause lengths the policy allows', async () => {
    const s = await armedScenario()
    renderApp('/', { mock: s.h.backend })
    const select = await screen.findByLabelText('Pause for')
    const options = within(select)
      .getAllByRole('option')
      .map((o) => o.textContent)
    expect(options).toEqual(['1 day', '3 days', '7 days', '14 days', '30 days'])
  })

  it('explains why pausing is unavailable while disarmed or when the policy forbids it', async () => {
    const s = await armedScenario({ arm: false })
    renderApp('/', { mock: s.h.backend })
    expect(
      await screen.findByText('Vacation mode only applies while the switch is armed.'),
    ).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Start vacation mode' })).not.toBeInTheDocument()
  })

  it('tells you when the yearly allowance is used up', async () => {
    const s = await armedScenario()
    await s.h.owner.putPolicy({
      ...(await s.h.owner.getState()).policy!,
      maxPauseSeconds: 60 * 86400,
    })
    await s.h.owner.pause(60 * 86400)
    s.h.backend.advance(61 * DAY_MS)
    await s.h.owner.pause(60 * 86400)
    s.h.backend.advance(61 * DAY_MS)
    renderApp('/', { mock: s.h.backend })
    expect(
      await screen.findByText('You have used your yearly vacation allowance.'),
    ).toBeInTheDocument()
  })
})
