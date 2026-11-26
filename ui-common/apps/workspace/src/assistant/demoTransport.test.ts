import { createApiClient, type ApiClient } from '@platform/api-client'
import { productModule as askYourLife } from '@platform/ask-your-life/module'
import { productModule as familyTreasury } from '@platform/family-treasury/module'
import { productModule as homePulse } from '@platform/home-pulse/module'
import { productModule as waitingOn } from '@platform/waiting-on/module'
import type { ProductModule } from '@platform/workspace-kit'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { anyOfTheWords, createDemoTransport, majorUnits, plainSnippet } from './demoTransport'
import { parseAppliances, parseFollowUps, parseLedger, parseSearch } from './tools'

let network: ReturnType<typeof vi.fn>
beforeEach(() => {
  network = vi.fn(() => Promise.reject(new Error('demo mode must not use the network')))
  vi.stubGlobal('fetch', network)
})
afterEach(() => vi.unstubAllGlobals())

const MODULES: ProductModule[] = [waitingOn, askYourLife, homePulse, familyTreasury]

/** What the workspace gives each module in demo mode: a client bound to its service over its own mock API. */
function demoTransport() {
  const clients = new Map<string, ApiClient>()
  for (const module of MODULES) {
    const demoFetch = module.createDemoFetch?.()
    if (!demoFetch) throw new Error(`${module.id} has no demo API`)
    clients.set(
      module.id,
      createApiClient({
        baseUrl: `http://localhost:8080/api/${module.service}`,
        getToken: () => 'demo-token',
        fetch: demoFetch,
      }),
    )
  }
  return createDemoTransport((id) => clients.get(id) ?? null)
}

describe('the demo transport (products mock APIs, no network)', () => {
  it('answers every tool in the same shape as mcp-server', async () => {
    const call = demoTransport()

    const followUps = await call('waiting_on_list_followups', {})
    expect(followUps.ok).toBe(true)
    const items = parseFollowUps(followUps.ok ? followUps.data : null)
    expect(items?.items.length).toBeGreaterThan(0)
    expect(
      items?.items.every((item) => ['OPEN', 'NUDGED', 'ESCALATED'].includes(item.status)),
    ).toBe(true)

    const search = await call('ask_your_life_search', { query: 'When is my dentist appointment?' })
    const passages = parseSearch(search.ok ? search.data : null)
    expect(passages?.passages.length).toBeGreaterThan(0)
    expect(passages?.passages[0]?.passage).not.toContain('<mark>')

    const appliances = await call('home_pulse_appliance_status', {})
    const status = parseAppliances(appliances.ok ? appliances.data : null)
    expect(status?.appliances.length).toBeGreaterThan(0)
    expect(status?.appliances.every((appliance) => appliance.health !== '')).toBe(true)

    const ledger = await call('family_treasury_ledger_summary', {})
    const summary = parseLedger(ledger.ok ? ledger.data : null)
    expect(summary?.households.length).toBeGreaterThan(0)
    expect(summary?.households[0]?.accounts.length).toBeGreaterThan(0)

    const one = await call('family_treasury_ledger_summary', {
      householdId: summary?.households[0]?.id ?? '',
    })
    expect(parseLedger(one.ok ? one.data : null)?.households).toHaveLength(1)

    expect(network).not.toHaveBeenCalled()
  }, 15_000)

  it('turns a missing product or a refusal into a sentence', async () => {
    const none = createDemoTransport(() => null)
    expect(await none('waiting_on_list_followups', {})).toMatchObject({
      ok: false,
      error: {
        kind: 'unavailable',
        message: "Waiting On isn't answering right now. Try again in a minute.",
      },
    })

    const refusing = createDemoTransport(() =>
      createApiClient({
        baseUrl: 'http://x.test',
        getToken: () => null,
        fetch: () =>
          Promise.resolve(
            new Response(JSON.stringify({ status: 403, title: 'Forbidden' }), {
              status: 403,
              headers: { 'content-type': 'application/problem+json' },
            }),
          ),
      }),
    )
    expect(await refusing('home_pulse_appliance_status', {})).toMatchObject({
      ok: false,
      error: { kind: 'permission' },
    })
    expect(network).not.toHaveBeenCalled()
  })

  it('formats like the tools do', () => {
    expect(plainSnippet('a <mark>b</mark> &amp; c&#39;s &lt;d&gt;')).toBe("a b & c's <d>")
    expect(majorUnits(12050, 'USD')).toBe('120.50')
    expect(majorUnits(-5, 'EUR')).toBe('-0.05')
    expect(majorUnits(1200, 'JPY')).toBe('1200')
    expect(anyOfTheWords('When is my dentist appointment?')).toBe('when OR dentist OR appointment')
    expect(anyOfTheWords('dentist')).toBeNull()
  })
})
