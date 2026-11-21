import { screen, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { DAY_MS } from '../../testing/harness'
import { renderApp, setupBrowserStubs } from '../../testing/render'
import { armedScenario } from '../../testing/scenario'

setupBrowserStubs()

describe('timeline page', () => {
  it('lists what happened, newest first, in plain language', async () => {
    const s = await armedScenario()
    s.h.backend.advance(8 * DAY_MS)
    renderApp('/timeline', { mock: s.h.backend })
    const items = within(await screen.findByRole('list', { name: 'Audit events' })).getAllByRole(
      'listitem',
    )
    const texts = items.map((i) => i.textContent ?? '')
    expect(texts[0]).toMatch(/Switch state changed.*ACTIVE to GRACE \(check-in missed\)/)
    expect(texts.some((t) => /Vault created/.test(t))).toBe(true)
    expect(texts.filter((t) => /Sealed share uploaded/.test(t))).toHaveLength(3)
    expect(texts.some((t) => /Trustee registered a key/.test(t) && /A trustee/.test(t))).toBe(true)
  })

  it('verifies the hash chain and offers the head hash to keep elsewhere', async () => {
    const s = await armedScenario()
    const r = renderApp('/timeline', { mock: s.h.backend })
    await r.user.click(await screen.findByRole('button', { name: 'Verify the chain' }))
    const ok = await screen.findByText('The chain is intact')
    const box = ok.closest('.callout') as HTMLElement
    expect(within(box).getByText(/\d+ events, none altered or removed/)).toBeInTheDocument()
    expect(within(box).getByText(/^[0-9a-f]{64}$/)).toBeInTheDocument()
    expect(within(box).getByRole('button', { name: 'Copy head hash' })).toBeInTheDocument()
  })

  it('reports where the chain breaks when history was edited behind its back', async () => {
    const s = await armedScenario()
    s.h.backend.tamperWithAudit(4)
    const r = renderApp('/timeline', { mock: s.h.backend })
    await r.user.click(await screen.findByRole('button', { name: 'Verify the chain' }))
    expect(await screen.findByText('The chain is broken')).toBeInTheDocument()
    expect(screen.getByText(/altered at or before event 4/)).toBeInTheDocument()
  })

  it('has an empty state before there is a vault', async () => {
    renderApp('/timeline')
    expect(await screen.findByRole('heading', { name: 'Nothing to show yet' })).toBeInTheDocument()
  })
})
