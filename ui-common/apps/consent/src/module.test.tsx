import { ApiProvider, createApiClient } from '@platform/api-client'
import { ThemeProvider, ToastProvider } from '@platform/ui'
import { ModuleBaseProvider } from '@platform/workspace-kit'
import { QueryClient } from '@tanstack/react-query'
import { render, renderHook, screen, waitFor } from '@testing-library/react'
import { useState, type ReactNode } from 'react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { describe, expect, it } from 'vitest'
import { createConsentDemoFetch } from './demo'
import { createMockBackend } from './mock/backend'
import { productModule } from './module'
import type { AccessRequest, Grant } from './shared/api/types'
import { buildTodayItems } from './today'

const DAY = 86_400_000
const NOW = Date.parse('2026-11-21T12:00:00Z')

const request = (over: Partial<AccessRequest> = {}): AccessRequest => ({
  id: 'r1',
  clientId: 'c1',
  clientName: 'Stride Shoes',
  scopes: ['profile.sizes:read', 'profile.name:read'],
  purpose: 'Recommend shoes that fit',
  durationSeconds: 7 * 86_400,
  maxReads: null,
  allowedHours: null,
  status: 'PENDING',
  createdAt: new Date(NOW - DAY).toISOString(),
  decidedAt: null,
  decisionNote: null,
  grantId: null,
  expiresAt: new Date(NOW - DAY + 7 * DAY).toISOString(),
  ...over,
})

const grant = (over: Partial<Grant> = {}): Grant => ({
  id: 'g1',
  clientId: 'c1',
  clientName: 'Meal Planner',
  scopes: ['health.allergies:read'],
  purpose: 'Plan meals',
  maxSensitivity: 'SENSITIVE',
  createdAt: new Date(NOW - 20 * DAY).toISOString(),
  expiresAt: new Date(NOW + 3 * DAY).toISOString(),
  maxReads: null,
  readsUsed: 0,
  allowedHours: null,
  revokedAt: null,
  lastReadAt: null,
  status: 'ACTIVE',
  ...over,
})

describe('productModule', () => {
  it('has the identity the workspace registry expects', () => {
    expect(productModule.id).toBe('consent')
    expect(productModule.service).toBe('consent')
    expect(productModule.title).toBe('Consent')
    expect(productModule.accent).toContain('--pp-color-')
    expect(typeof productModule.Routes).toBe('function')
    expect(typeof productModule.useTodayItems).toBe('function')
    expect(typeof productModule.createDemoFetch).toBe('function')
  })

  it('declares the navigation, every path relative to the module base, with an icon', () => {
    expect(productModule.nav.map((n) => n.label)).toEqual([
      'Overview',
      'Requests',
      'Grants',
      'Vault',
      'Apps',
      'History',
      'Audit',
    ])
    expect(productModule.nav[0]).toMatchObject({ to: '/', end: true })
    for (const item of productModule.nav) {
      expect(item.to.startsWith('/')).toBe(true)
      expect(item.icon).toBeDefined()
    }
  })

  it('createDemoFetch answers the owner API at the gateway path, with no network and no token', async () => {
    const demoFetch = productModule.createDemoFetch?.()
    expect(demoFetch).toBeDefined()
    const response = await demoFetch?.('http://gateway.test/api/consent/v1/owner/dashboard')
    expect(response?.status).toBe(200)
    const body = (await response?.json()) as { pendingRequests: number }
    expect(body.pendingRequests).toBe(2)
  })

  it('each createDemoFetch call starts from a fresh in-memory gateway', async () => {
    const first = createConsentDemoFetch()
    const second = createConsentDemoFetch()
    await first('http://gateway.test/api/consent/v1/owner/requests?status=PENDING')
    const [pending] = (await (
      await first('http://gateway.test/api/consent/v1/owner/requests?status=PENDING')
    ).json()) as { id: string }[]
    await first(`http://gateway.test/api/consent/v1/owner/requests/${pending?.id}/deny`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({}),
    })
    const left = (await (
      await second('http://gateway.test/api/consent/v1/owner/requests?status=PENDING')
    ).json()) as unknown[]
    expect(left).toHaveLength(2)
  })
})

describe('buildTodayItems', () => {
  it('lists pending requests as warnings, then grants ending within seven days', () => {
    // the deadline is whatever the gateway reports, not a TTL the UI assumes
    const deadline = '2026-11-23T09:00:00.000Z'
    const items = buildTodayItems(
      [
        request({ expiresAt: deadline }),
        request({ id: 'r2', clientName: 'Old', status: 'DENIED', expiresAt: null }),
      ],
      [
        grant(),
        grant({ id: 'g2', clientName: 'Far', expiresAt: new Date(NOW + 30 * DAY).toISOString() }),
      ],
      NOW,
    )
    expect(items.map((i) => i.id)).toEqual(['request:r1', 'grant:g1'])
    expect(items[0]).toMatchObject({
      severity: 'warn',
      to: '/requests',
      title: 'Stride Shoes is asking to read your data',
    })
    expect(items[0]?.subtitle).toContain('profile.sizes:read and 1 more')
    expect(items[0]?.dueAt).toBe(deadline)
    expect(items[1]).toMatchObject({ severity: 'info', to: '/grants', dueAt: grant().expiresAt })
  })

  it('skips ended grants and grants that have already expired', () => {
    expect(
      buildTodayItems(
        [],
        [
          grant({ status: 'REVOKED' }),
          grant({ id: 'g3', expiresAt: new Date(NOW - DAY).toISOString() }),
        ],
        NOW,
      ),
    ).toEqual([])
  })

  it('puts the request that expires soonest first', () => {
    const items = buildTodayItems(
      [
        // the gateway's deadline decides the order, not when the request was created
        request({ id: 'new', expiresAt: new Date(NOW + 7 * DAY).toISOString() }),
        request({ id: 'old', expiresAt: new Date(NOW + 2 * DAY).toISOString() }),
      ],
      [],
      NOW,
    )
    expect(items.map((i) => i.id)).toEqual(['request:old', 'request:new'])
  })
})

function ModuleHarness({
  children,
  seed = 'demo',
}: {
  children: ReactNode
  seed?: 'demo' | 'empty'
}) {
  const [{ client, queryClient }] = useState(() => ({
    client: createApiClient({
      baseUrl: 'http://gateway.test/api/consent',
      getToken: () => Promise.resolve('token'),
      fetch: createMockBackend({ seed }).fetch,
    }),
    queryClient: new QueryClient({ defaultOptions: { queries: { retry: false } } }),
  }))
  return (
    <ThemeProvider>
      <ApiProvider client={client} queryClient={queryClient}>
        <ToastProvider>{children}</ToastProvider>
      </ApiProvider>
    </ThemeProvider>
  )
}

describe('useTodayItems', () => {
  it('reads pending requests and expiring grants through the module API client', async () => {
    const useToday = productModule.useTodayItems
    if (!useToday) throw new Error('useTodayItems missing')
    const { result } = renderHook(() => useToday(), {
      wrapper: ({ children }) => <ModuleHarness>{children}</ModuleHarness>,
    })
    expect(result.current.loading).toBe(true)
    await waitFor(() => expect(result.current.loading).toBe(false))
    const requests = result.current.items.filter((i) => i.id.startsWith('request:'))
    expect(requests).toHaveLength(2)
    for (const item of result.current.items) {
      expect(item.to.startsWith('/')).toBe(true)
      expect(['warn', 'info']).toContain(item.severity)
    }
  })

  it('is empty for a new owner', async () => {
    const useToday = productModule.useTodayItems
    if (!useToday) throw new Error('useTodayItems missing')
    const { result } = renderHook(() => useToday(), {
      wrapper: ({ children }) => <ModuleHarness seed="empty">{children}</ModuleHarness>,
    })
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.items).toEqual([])
  })
})

describe('links under a workspace base', () => {
  const mount = (route: string, seed: 'demo' | 'empty' = 'demo') =>
    render(
      <MemoryRouter initialEntries={[`/app/consent${route}`]}>
        <ModuleHarness seed={seed}>
          <ModuleBaseProvider base="/app/consent">
            <Routes>
              <Route path="app/consent/*" element={<productModule.Routes />} />
            </Routes>
          </ModuleBaseProvider>
        </ModuleHarness>
      </MemoryRouter>,
    )

  const hrefs = () =>
    Array.from(document.querySelectorAll('a[href]')).map((a) => a.getAttribute('href') ?? '')

  it('prefixes every link on the home page', async () => {
    mount('')
    await screen.findByRole('link', { name: 'Manage grants' })
    await screen.findByRole('link', { name: 'Open audit' })
    const found = hrefs()
    expect(found.length).toBeGreaterThanOrEqual(4)
    for (const href of found) expect(href.startsWith('/app/consent')).toBe(true)
    expect(found).toContain('/app/consent/grants')
    expect(found).toContain('/app/consent/history')
  })

  it('prefixes the first-run link, including its query', async () => {
    mount('', 'empty')
    const link = await screen.findByRole('link', { name: 'Add your first attribute' })
    expect(link).toHaveAttribute('href', '/app/consent/vault?add=1')
  })

  it('prefixes the per-app activity link and the not-found link', async () => {
    mount('/clients')
    const link = await screen.findAllByRole('link', { name: /View activity for/ })
    for (const a of link)
      expect(a.getAttribute('href')).toMatch(/^\/app\/consent\/history\?client=/)
    document.body.innerHTML = ''
    mount('/nowhere')
    const back = await screen.findByRole('link', { name: 'Back to the overview' })
    expect(back.getAttribute('href')).toMatch(/^\/app\/consent\/?$/)
  })
})
