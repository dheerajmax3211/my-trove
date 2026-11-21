import { screen, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { DAY_MS } from '../../testing/harness'
import { renderApp, setupBrowserStubs } from '../../testing/render'
import { armedScenario } from '../../testing/scenario'

setupBrowserStubs()

const refresh = (r: ReturnType<typeof renderApp>) =>
  r.user.click(screen.getByRole('button', { name: 'Refresh status' }))

function ladder() {
  return screen.getByRole('list', { name: 'From checked in to released' })
}

/** The rung the switch is on: the list item marked as the current step. */
function currentRung(): string {
  const item = within(ladder())
    .getAllByRole('listitem')
    .find((li) => li.getAttribute('aria-current') === 'step')
  return item?.textContent ?? ''
}

describe('home: first run (no vault)', () => {
  it('says what the product is, how it works, and what is locked where', async () => {
    renderApp('/')
    expect(
      await screen.findByRole('heading', { level: 1, name: 'You have no vault yet' }),
    ).toBeInTheDocument()
    expect(screen.getByText(/hands it to the people you choose only if you stop/)).toBeVisible()
    const how = screen.getByRole('list', { name: 'How Digital Legacy works' })
    expect(within(how).getAllByRole('listitem')).toHaveLength(3)
    expect(screen.getByRole('heading', { name: 'Stays on your device' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'What the server holds' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Create your vault' })).toHaveAttribute(
      'href',
      '/vault',
    )
    // nothing to check in to yet
    expect(screen.queryByRole('button', { name: "I'm here" })).not.toBeInTheDocument()
  })
})

describe('home: armed and healthy', () => {
  it('leads with the state, the next deadline and the check-in, then the ladder and the trustees', async () => {
    const s = await armedScenario()
    renderApp('/', { mock: s.h.backend })
    expect(await screen.findByRole('heading', { level: 1, name: 'All quiet' })).toBeInTheDocument()
    expect(screen.getByText('Active')).toBeInTheDocument()
    expect(screen.getByText('Armed')).toBeInTheDocument()
    expect(screen.getByText('Next check-in due in')).toBeInTheDocument()
    expect(screen.getByRole('timer')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: "I'm here" })).toBeEnabled()

    expect(currentRung()).toMatch(/You check in/)
    expect(within(ladder()).getAllByRole('listitem')).toHaveLength(5)
    expect(within(ladder()).getByText(/2 of your 3 trustees must approve/)).toBeInTheDocument()

    const circle = await screen.findByRole('list', { name: 'Trustees' })
    for (const name of ['Ada', 'Ben', 'Cleo'])
      expect(within(circle).getByRole('listitem', { name })).toHaveTextContent(
        'Holds a piece of the key',
      )
    expect(
      screen.getByText('2 of 3 must agree before anything is released.', { exact: false }),
    ).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Manage trustees' })).toHaveAttribute(
      'href',
      '/trustees',
    )
  })

  it('shows the hours left, still quiet, when the deadline is close', async () => {
    const s = await armedScenario()
    s.h.backend.advance(6.5 * DAY_MS)
    renderApp('/', { mock: s.h.backend })
    expect(await screen.findByRole('heading', { name: 'All quiet' })).toBeInTheDocument()
    expect(screen.getByRole('timer')).toHaveTextContent(/^1\dh \d\dm \d\ds$/)
    expect(currentRung()).toMatch(/You check in/)
  })

  it('says plainly that an unarmed switch does nothing', async () => {
    const s = await armedScenario({ arm: false })
    await s.h.owner.disarm()
    renderApp('/', { mock: s.h.backend })
    expect(await screen.findByRole('heading', { level: 1, name: 'Not armed' })).toBeInTheDocument()
    expect(screen.getByText('Not armed', { selector: '.badge' })).toBeInTheDocument()
    expect(screen.getByText(/nothing on this ladder will happen/)).toBeInTheDocument()
    expect(screen.queryByRole('timer')).not.toBeInTheDocument()
  })
})

describe('home: when silence passes', () => {
  it('moves along the ladder from the grace period to the trustees, and a check-in goes back to the start', async () => {
    const s = await armedScenario()
    const r = renderApp('/', { mock: s.h.backend })
    await screen.findByRole('heading', { name: 'All quiet' })

    s.h.backend.advance(8 * DAY_MS)
    await refresh(r)
    expect(await screen.findByRole('heading', { name: 'Check-in missed' })).toBeInTheDocument()
    expect(currentRung()).toMatch(/Grace period/)
    expect(screen.getByText('Reminders begin in')).toBeInTheDocument()

    s.h.backend.advance(4 * DAY_MS)
    await refresh(r)
    expect(await screen.findByRole('heading', { name: 'Reminders are going out' })).toBeVisible()
    expect(currentRung()).toMatch(/Reminders/)

    s.h.backend.advance(7 * DAY_MS)
    await refresh(r)
    expect(await screen.findByRole('heading', { name: 'Waiting for your trustees' })).toBeVisible()
    expect(currentRung()).toMatch(/Trustees decide/)

    await r.user.click(screen.getByRole('button', { name: "I'm here" }))
    expect(await screen.findByRole('heading', { name: 'All quiet' })).toBeInTheDocument()
    expect(currentRung()).toMatch(/You check in/)
  })
})

describe('home: released', () => {
  it('ends the ladder, explains it cannot be undone and turns the check-in off', async () => {
    const s = await armedScenario()
    const r = renderApp('/', { mock: s.h.backend })
    await screen.findByRole('heading', { name: 'All quiet' })
    s.h.backend.advance(17 * DAY_MS + 3600_000)
    await s.trustees[0]?.api.vote('APPROVE')
    await s.trustees[1]?.api.vote('APPROVE')
    s.h.backend.advance(3 * DAY_MS + 3600_000)
    await refresh(r)
    expect(await screen.findByRole('heading', { level: 1, name: 'Released' })).toBeInTheDocument()
    expect(currentRung()).toMatch(/Vault released/)
    expect(screen.getByRole('status')).toHaveTextContent(/can no longer undo it/)
    expect(screen.getByRole('button', { name: "I'm here" })).toBeDisabled()
    expect(screen.queryByRole('timer')).not.toBeInTheDocument()
  })
})

describe('home: error', () => {
  it('shows what failed and lets you retry, with no half-drawn switch', async () => {
    const s = await armedScenario()
    const original = s.h.backend.fetch
    let fail = true
    ;(s.h.backend as { fetch: typeof fetch }).fetch = (input, init) =>
      fail
        ? Promise.resolve(
            new Response(JSON.stringify({ title: 'Boom', status: 503, detail: 'Service down' }), {
              status: 503,
              headers: { 'content-type': 'application/problem+json' },
            }),
          )
        : original(input, init)
    const r = renderApp('/', { mock: s.h.backend })
    expect(
      await screen.findByText('Service down', undefined, { timeout: 8000 }),
    ).toBeInTheDocument()
    expect(screen.getByRole('alert')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: "I'm here" })).not.toBeInTheDocument()
    fail = false
    await r.user.click(screen.getByRole('button', { name: 'Try again' }))
    expect(await screen.findByRole('heading', { name: 'All quiet' })).toBeInTheDocument()
  }, 15000)
})
