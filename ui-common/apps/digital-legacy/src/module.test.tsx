import { ApiProvider } from '@platform/api-client'
import { ThemeProvider, ToastProvider, TooltipProvider } from '@platform/ui'
import { ModuleBaseProvider } from '@platform/workspace-kit'
import { act, render, renderHook, screen, waitFor } from '@testing-library/react'
import { useEffect, useRef, type ReactNode } from 'react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { describe, expect, it } from 'vitest'
import { generateVaultKey, type Bytes } from './crypto'
import { OwnerRoutes } from './OwnerRoutes'
import { createDemoFetch } from './demoFetch'
import { buildTodayItems, useTodayItems } from './features/today'
import { VaultKeyProvider, useVaultKey } from './features/vault/VaultKeyContext'
import { saveVault } from './features/vault/vaultService'
import { MockBackend } from './mock/backend'
import { productModule } from './module'
import { createHarness, DAY_MS } from './testing/harness'
import { armedScenario, sampleDocument } from './testing/scenario'
import { setupBrowserStubs } from './testing/render'
import type { StateView, TrusteeView } from './api/types'

setupBrowserStubs()

const BASE = '/app/digital-legacy'

describe('productModule', () => {
  it('has the identity the workspace registry expects', () => {
    expect(productModule.id).toBe('digital-legacy')
    expect(productModule.service).toBe('digital-legacy')
    expect(productModule.title).toBe('Digital Legacy')
    expect(productModule.accent).toBe('var(--pp-color-product-digital-legacy)')
    expect(productModule.requiredPermission).toBeUndefined()
    expect(typeof productModule.Routes).toBe('function')
    expect(typeof productModule.Providers).toBe('function')
    expect(typeof productModule.useTodayItems).toBe('function')
    expect(typeof productModule.createDemoFetch).toBe('function')
  })

  it('lists the owner pages only, as module-relative paths with icons', () => {
    expect(productModule.nav.map((n) => [n.label, n.to])).toEqual([
      ['Overview', '/'],
      ['Vault', '/vault'],
      ['Trustees', '/trustees'],
      ['Check-in policy', '/policy'],
      ['Timeline', '/timeline'],
    ])
    expect(productModule.nav[0]?.end).toBe(true)
    for (const item of productModule.nav) {
      expect(item.to.startsWith('/')).toBe(true)
      expect(item.icon).toBeDefined()
      expect(item.to.startsWith('/trustee/')).toBe(false)
    }
  })
})

describe('createDemoFetch', () => {
  const url = 'http://gateway.test/api/digital-legacy/v1/legacy/vault/state'
  const auth = { headers: { authorization: 'Bearer demo-token' } }

  it('is an in-memory server that answers through the gateway path, without a network call', async () => {
    const f = createDemoFetch()
    const none = await f(url, auth)
    expect(none.status).toBe(404) // no vault yet: the first-run screen
    expect((await f(url)).status).toBe(401) // the owner chain needs a bearer token
  })

  it('gives every call its own backend', async () => {
    const a = createDemoFetch()
    const b = createDemoFetch()
    const created = await a(`http://gateway.test/api/digital-legacy/v1/legacy/vault`, {
      ...auth,
      method: 'POST',
      body: JSON.stringify({
        ciphertext: btoa('A'.repeat(64)),
        metadata: { v: 1, alg: 'AES-256-GCM', nonce: btoa('B'.repeat(12)) },
      }),
    })
    expect(created.status, await created.clone().text()).toBeLessThan(300)
    expect((await a(url, auth)).status).toBe(200)
    expect((await b(url, auth)).status).toBe(404)
  })
})

describe('vault key session', () => {
  function Probe({ onKey }: { onKey: (key: Bytes) => void }) {
    const { unlock } = useVaultKey()
    const started = useRef(false)
    useEffect(() => {
      if (started.current) return
      started.current = true
      const key = generateVaultKey()
      onKey(key)
      unlock(key)
    })
    return null
  }

  it('is wiped when the module unmounts (switching modules or signing out)', () => {
    const Providers = productModule.Providers
    if (!Providers) throw new Error('the module has no Providers')
    let held: Bytes | null = null
    const view = render(
      <Providers>
        <Probe onKey={(key) => (held = key)} />
      </Providers>,
    )
    expect(held).not.toBeNull()
    expect((held as Bytes | null)?.some((byte) => byte !== 0)).toBe(true)
    view.unmount()
    expect((held as Bytes | null)?.every((byte) => byte === 0)).toBe(true)
  })

  it('is wiped on lock and never reaches storage', () => {
    let held: Bytes | null = null
    let lock: () => void = () => undefined
    function Grab() {
      const value = useVaultKey()
      useEffect(() => {
        lock = value.lock
      })
      return <Probe onKey={(key) => (held = key)} />
    }
    render(
      <VaultKeyProvider>
        <Grab />
      </VaultKeyProvider>,
    )
    const hex = Array.from(held as unknown as Bytes, (b) => b.toString(16).padStart(2, '0')).join(
      '',
    )
    const dump = JSON.stringify([
      { ...localStorage },
      { ...sessionStorage },
      document.cookie,
    ]).toLowerCase()
    expect(dump).not.toContain(hex)
    act(() => lock())
    expect((held as Bytes | null)?.every((byte) => byte === 0)).toBe(true)
  })
})

function Frame({ backend, children }: { backend: MockBackend; children: ReactNode }) {
  const h = createHarness(backend)
  return (
    <ThemeProvider>
      <TooltipProvider>
        <ToastProvider>
          <ApiProvider client={h.ownerClient}>{children}</ApiProvider>
        </ToastProvider>
      </TooltipProvider>
    </ThemeProvider>
  )
}

/** Mounts the owner pages the way the workspace does: under `/app/digital-legacy/*` with the base set. */
function mountUnderBase(backend: MockBackend, route: string) {
  return render(
    <Frame backend={backend}>
      <MemoryRouter initialEntries={[`${BASE}${route}`]}>
        <ModuleBaseProvider base={BASE}>
          <VaultKeyProvider>
            <Routes>
              <Route path={`${BASE}/*`} element={<OwnerRoutes />} />
            </Routes>
          </VaultKeyProvider>
        </ModuleBaseProvider>
      </MemoryRouter>
    </Frame>,
  )
}

async function settled(): Promise<void> {
  await waitFor(() => expect(document.querySelector('[aria-busy="true"]')).toBeNull(), {
    timeout: 5000,
  })
  // let the second wave of queries (trustees beside the state) land
  await new Promise((resolve) => setTimeout(resolve, 50))
}

function hrefs(): string[] {
  return Array.from(document.querySelectorAll('a[href]'), (a) => a.getAttribute('href') ?? '')
}

describe('links under a module base', () => {
  it('first run: the call to action points inside the module', async () => {
    mountUnderBase(new MockBackend(), '')
    const link = await screen.findByRole('link', { name: 'Create your vault' })
    expect(link).toHaveAttribute('href', `${BASE}/vault`)
  })

  it('every owner link on every page keeps the base (no vault, vault without policy, armed)', async () => {
    const vaultOnly = new MockBackend()
    await saveVault(createHarness(vaultOnly).owner, generateVaultKey(), sampleDocument, 'create')
    const armed = (await armedScenario()).h.backend
    const cases: [string, MockBackend, string][] = [
      ['no vault, overview', new MockBackend(), ''],
      ['no vault, trustees', new MockBackend(), '/trustees'],
      ['no vault, policy', new MockBackend(), '/policy'],
      ['vault only, overview', vaultOnly, ''],
      ['vault only, trustees', vaultOnly, '/trustees'],
      ['armed, overview', armed, ''],
      ['armed, vault', armed, '/vault'],
      ['armed, trustees', armed, '/trustees'],
      ['armed, policy', armed, '/policy'],
      ['armed, timeline', armed, '/timeline'],
    ]
    let seen = 0
    for (const [name, backend, route] of cases) {
      const view = mountUnderBase(backend, route)
      await settled()
      const found = hrefs()
      seen += found.length
      for (const href of found) expect(href, name).toMatch(/^\/app\/digital-legacy(\/|$)/)
      view.unmount()
    }
    expect(seen).toBeGreaterThan(8)
  })
})

function state(over: Partial<StateView> = {}): StateView {
  return {
    state: 'ACTIVE',
    armed: true,
    epoch: 1,
    lastCheckInAt: '2026-11-20T09:00:00Z',
    nextDueAt: '2026-11-27T09:00:00Z',
    pausedUntil: null,
    stateEnteredAt: null,
    nextActionAt: null,
    releasedAt: null,
    escalation: { stepsExecuted: 0, totalSteps: 4 },
    quorum: {
      required: 2,
      approved: 0,
      declined: 0,
      trusteesActive: 3,
      trusteesHoldingShare: 3,
      quorumReachedAt: null,
      releaseNotBefore: null,
    },
    pause: { usedSeconds: 0, yearlyBudgetSeconds: 120 * 86400, maxSingleSeconds: 30 * 86400 },
    readiness: { armable: true, problems: [] },
    policy: null,
    ...over,
  }
}

function trustee(label: string, status: TrusteeView['status'], expires?: string): TrusteeView {
  return {
    id: label,
    label,
    status,
    keyAlgorithm: null,
    publicKey: null,
    keyFingerprint: null,
    shareUploaded: false,
    shareVaultVersion: null,
    shareCurrent: false,
    shareConfirmed: false,
    acceptedAt: null,
    inviteExpiresAt: expires ?? null,
  }
}

describe('buildTodayItems', () => {
  const now = Date.parse('2026-11-21T09:00:00Z')

  it('has nothing to say before a vault exists', () => {
    expect(buildTodayItems(undefined, undefined, now)).toEqual([])
  })

  it('warns when the check-in is due within seven days', () => {
    const [item, ...rest] = buildTodayItems(state(), [], now)
    expect(rest).toEqual([])
    expect(item).toMatchObject({
      id: 'check-in',
      severity: 'warn',
      to: '/',
      dueAt: '2026-11-27T09:00:00.000Z',
    })
    expect(item?.subtitle).toBe('Due in 6 days.')
  })

  it('is only an info line while the deadline is far off', () => {
    const items = buildTodayItems(state({ nextDueAt: '2026-12-25T09:00:00Z' }), [], now)
    expect(items.map((i) => [i.id, i.severity])).toEqual([['armed', 'info']])
  })

  it('is urgent when the deadline passed or the switch has moved on', () => {
    expect(buildTodayItems(state({ nextDueAt: '2026-11-20T09:00:00Z' }), [], now)[0]).toMatchObject(
      { id: 'check-in', severity: 'danger', title: 'Your check-in is overdue' },
    )
    for (const s of ['GRACE', 'ESCALATING', 'RELEASE_PENDING'] as const)
      expect(buildTodayItems(state({ state: s }), [], now)[0]).toMatchObject({
        id: 'check-in',
        severity: 'danger',
        to: '/',
      })
  })

  it('reports a vacation pause as information instead of a check-in', () => {
    const items = buildTodayItems(state({ pausedUntil: '2026-11-25T09:00:00Z' }), [], now)
    expect(items.map((i) => [i.id, i.severity])).toEqual([['paused', 'info']])
  })

  it('says so when the vault was released', () => {
    const items = buildTodayItems(
      state({ state: 'RELEASED', releasedAt: '2026-11-21T08:00:00Z' }),
      [],
      now,
    )
    expect(items).toHaveLength(1)
    expect(items[0]).toMatchObject({ id: 'released', severity: 'danger' })
  })

  it('does not nag about a switch that is not armed', () => {
    expect(buildTodayItems(state({ armed: false }), [], now)).toEqual([])
  })

  it('groups invitations nobody answered, pointing at the trustees page', () => {
    const items = buildTodayItems(
      state({ nextDueAt: '2026-12-25T09:00:00Z' }),
      [
        trustee('Ada', 'INVITED', '2026-11-30T09:00:00Z'),
        trustee('Ben', 'INVITED', '2026-11-22T09:00:00Z'),
        trustee('Cleo', 'ACCEPTED'),
      ],
      now,
    )
    const invitations = items.find((i) => i.id === 'invitations')
    expect(invitations).toMatchObject({
      title: '2 trustee invitations have not been accepted',
      to: '/trustees',
      severity: 'warn', // Ben's invite lapses within three days
      dueAt: '2026-11-22T09:00:00.000Z',
    })
    expect(invitations?.subtitle).toBe('Ada, Ben have not registered a key yet.')
    expect(items.every((i) => i.to.startsWith('/'))).toBe(true)
  })
})

describe('useTodayItems', () => {
  function wrapperFor(backend: MockBackend) {
    const h = createHarness(backend)
    return ({ children }: { children: ReactNode }) => (
      <ApiProvider client={h.ownerClient}>{children}</ApiProvider>
    )
  }

  it('is empty, and finished loading, when there is no vault', async () => {
    const { result } = renderHook(() => useTodayItems(), {
      wrapper: wrapperFor(new MockBackend()),
    })
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.items).toEqual([])
  })

  it('reads the real state and trustees, with a stable array between renders', async () => {
    const s = await armedScenario()
    s.h.backend.advance(5 * DAY_MS)
    const invite = await s.h.owner.invite('Dana')
    const { result, rerender } = renderHook(() => useTodayItems(), {
      wrapper: wrapperFor(s.h.backend),
    })
    await waitFor(() => expect(result.current.loading).toBe(false))
    const ids = result.current.items.map((i) => i.id)
    expect(ids).toEqual(['check-in', 'invitations'])
    expect(result.current.items[0]?.severity).toBe('warn')
    expect(result.current.items[1]?.subtitle).toContain('Dana')
    expect(invite.trusteeId).toBeTruthy()
    const first = result.current.items
    rerender()
    expect(result.current.items).toBe(first)
  })
})
