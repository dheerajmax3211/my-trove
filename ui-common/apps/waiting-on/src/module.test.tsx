import { ApiProvider, createApiClient } from '@platform/api-client'
import { ToastProvider } from '@platform/ui'
import { ModuleBaseProvider } from '@platform/workspace-kit'
import { QueryClient } from '@tanstack/react-query'
import { render, renderHook, screen, waitFor } from '@testing-library/react'
import { Fragment, type ReactNode } from 'react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { describe, expect, it } from 'vitest'
import { createDemoFetch, productModule } from './module'
import { demoSeed } from './mock/seed'
import { createMockBackend } from './mock/backend'
import { todayItemsFrom } from './today'
import type { Item } from './features/items/api/types'
import { NOW } from './testing/harness'

const BASE = '/app/waiting-on'
const JACKET = '00000000-0000-4000-8000-000000000001'

describe('productModule', () => {
  it('has the identity the workspace registry expects', () => {
    expect(productModule.id).toBe('waiting-on')
    expect(productModule.service).toBe('waiting-on')
    expect(productModule.title).toBe('Waiting On')
    expect(productModule.accent).toBe('var(--pp-color-product-waiting-on)')
    expect(productModule.requiredPermission).toBeUndefined()
    expect(typeof productModule.Routes).toBe('function')
    expect(typeof productModule.Providers).toBe('function')
    expect(typeof productModule.useTodayItems).toBe('function')
    expect(typeof productModule.createDemoFetch).toBe('function')
    expect(productModule.tagline).not.toBe('')
    expect(productModule.description).not.toBe('')
  })

  it('declares module-relative navigation', () => {
    expect(productModule.nav.map((n) => [n.to, n.label])).toEqual([
      ['/', 'Waiting on'],
      ['/new', 'Add something'],
    ])
    expect(productModule.nav[0]?.end).toBe(true)
    for (const item of productModule.nav) {
      expect(item.to.startsWith('/')).toBe(true)
      expect(item.icon).toBeDefined()
    }
  })
})

describe('createDemoFetch', () => {
  it('serves the mock service under the gateway path and needs no token', async () => {
    const f = createDemoFetch()
    const list = await f('http://gw.test/api/waiting-on/v1/items?status=OPEN&limit=100')
    expect(list.status).toBe(200)
    const items = (await list.json()) as Item[]
    expect(items.length).toBeGreaterThan(0)
    expect(items.every((i) => i.status === 'OPEN')).toBe(true)
    const missing = await f(
      'http://gw.test/api/waiting-on/v1/items/00000000-0000-4000-8000-000000009999',
    )
    expect(missing.status).toBe(404)
  })

  it('gives every call its own in-memory state', async () => {
    const a = createDemoFetch()
    const b = createDemoFetch()
    const create = await a('http://gw.test/api/waiting-on/v1/items', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        title: 'Only in a',
        counterparty: 'Somebody',
        category: 'OTHER',
        expectedBy: '2030-01-01',
      }),
    })
    expect(create.status).toBe(201)
    const inA = (await (await a('http://gw.test/api/waiting-on/v1/items')).json()) as Item[]
    const inB = (await (await b('http://gw.test/api/waiting-on/v1/items')).json()) as Item[]
    expect(inA.length).toBe(inB.length + 1)
  })
})

function mount(route: string, ui: ReactNode, fetchImpl: typeof fetch = createDemoFetch()) {
  const client = createApiClient({
    baseUrl: 'http://gw.test/api/waiting-on',
    getToken: () => Promise.resolve('token'),
    fetch: fetchImpl,
  })
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  const Providers = productModule.Providers ?? Fragment
  return {
    queryClient,
    wrapper: ({ children }: { children: ReactNode }) => (
      <MemoryRouter initialEntries={[route]}>
        <ApiProvider client={client} queryClient={queryClient}>
          <ToastProvider>
            <Providers>
              <ModuleBaseProvider base={BASE}>{children}</ModuleBaseProvider>
            </Providers>
          </ToastProvider>
        </ApiProvider>
      </MemoryRouter>
    ),
    ui,
  }
}

function renderMounted(route: string, fetchImpl?: typeof fetch) {
  const { wrapper: Wrapper, ui } = mount(
    route,
    <Routes>
      <Route path={`${BASE}/*`} element={<productModule.Routes />} />
    </Routes>,
    fetchImpl,
  )
  return render(<Wrapper>{ui}</Wrapper>)
}

const hrefs = () =>
  [...document.querySelectorAll('a[href]')].map((a) => a.getAttribute('href') as string)

describe('links under a base', () => {
  it('home: every link stays inside the module', async () => {
    renderMounted(BASE)
    await screen.findByRole('group', { name: 'Waiting items' })
    const found = hrefs()
    expect(found.length).toBeGreaterThan(5)
    for (const href of found) expect(href.startsWith(BASE)).toBe(true)
    expect(found).toContain(`${BASE}/new`)
    expect(found).toContain(`${BASE}/items/${JACKET}`)
  })

  it('first use: the call to action stays inside the module', async () => {
    const backend = createMockBackend({ clock: () => NOW, seed: [] })
    renderMounted(BASE, (input, init) => backend.fetch(rewrite(input), withToken(init)))
    await screen.findByRole('heading', { name: /Tell Waiting On what you are waiting for/ })
    expect(hrefs()).toContain(`${BASE}/new`)
    for (const href of hrefs()) expect(href.startsWith(BASE)).toBe(true)
  })

  it('add form, item page and unknown page keep their links inside the module', async () => {
    for (const [route, ready] of [
      [`${BASE}/new`, () => screen.findByRole('heading', { level: 1, name: /Add something/ })],
      [
        `${BASE}/items/${JACKET}`,
        () => screen.findByRole('heading', { level: 1, name: 'Refund for returned jacket' }),
      ],
      [`${BASE}/nowhere`, () => screen.findByRole('heading', { level: 1, name: 'Page not found' })],
    ] as const) {
      const view = renderMounted(route)
      await ready()
      const found = hrefs()
      expect(found.length).toBeGreaterThan(0)
      for (const href of found) expect(href.startsWith(BASE)).toBe(true)
      view.unmount()
    }
  })

  it('navigates inside the module after adding an item', async () => {
    const { default: userEvent } = await import('@testing-library/user-event')
    const user = userEvent.setup()
    renderMounted(BASE)
    await screen.findByRole('group', { name: 'Waiting items' })
    await user.click(screen.getAllByRole('link', { name: 'Add something you are waiting for' })[0]!)
    expect(
      await screen.findByRole('heading', { level: 1, name: 'Add something you are waiting for' }),
    ).toBeInTheDocument()
  })
})

function rewrite(input: RequestInfo | URL): string {
  const raw = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url
  const url = new URL(raw)
  return url.pathname.replace('/api/waiting-on', '/api') + url.search
}
const withToken = (init?: RequestInit): RequestInit => ({
  ...init,
  headers: { ...(init?.headers as Record<string, string>), authorization: 'Bearer t' },
})

describe('todayItemsFrom', () => {
  const items = demoSeed(NOW)
    .map((e) => ({ ...e.item, replyAddress: 'x', followUp: null }))
    .filter((i) => (i as unknown as { ownerUid: string }).ownerUid === 'demo-user')

  it('lists overdue, due-soon and soon-to-be-followed-up items, most urgent first', () => {
    const today = todayItemsFrom(
      items.filter((i) => ['OPEN', 'NUDGED', 'ESCALATED'].includes(i.status)),
      NOW,
    )
    expect(today.map((t) => [t.title, t.severity])).toEqual([
      ['Water damage claim #88213', 'danger'],
      ['Refund for returned jacket', 'danger'],
      ['Standing desk order #5521', 'danger'],
    ])
    const jacket = today.find((t) => t.title === 'Refund for returned jacket')
    expect(jacket).toMatchObject({
      id: JACKET,
      to: `/items/${JACKET}`,
      subtitle: 'Waiting on Northwind Outfitters. Overdue by 8 days',
    })
    // due in five days and three weeks, with nothing scheduled sooner: not urgent yet
    expect(today.map((t) => t.title)).not.toContain('Visa renewal decision')
    expect(today.map((t) => t.title)).not.toContain('Conference travel expenses')
  })

  it('marks an item due within three days as a warning', () => {
    const soon = {
      ...items.find((i) => i.title === 'Conference travel expenses')!,
      expectedBy: '2026-11-21',
    }
    expect(todayItemsFrom([soon], NOW)[0]).toMatchObject({
      severity: 'warn',
      subtitle: 'Waiting on Finance team at Acme Corp. Due in 2 days',
    })
  })

  it('adds an info entry for an item whose follow-up is about to go out', () => {
    const future: Item = {
      ...(items.find((i) => i.title === 'Visa renewal decision') as Item),
      createdAt: new Date(NOW.getTime() - 2 * 86_400_000).toISOString(),
      plan: {
        nudgeAfterDays: 4,
        escalateAfterDays: 10,
        finalNoticeAfterDays: 0,
        expireAfterDays: 30,
      },
    }
    const today = todayItemsFrom([future], NOW)
    expect(today).toHaveLength(1)
    expect(today[0]).toMatchObject({
      severity: 'info',
      subtitle: expect.stringContaining('Friendly nudge'),
    })
  })

  it('ignores closed items', () => {
    expect(
      todayItemsFrom(
        items.filter((i) => ['RESOLVED', 'EXPIRED', 'CANCELLED'].includes(i.status)),
        NOW,
      ),
    ).toEqual([])
  })
})

describe('useTodayItems', () => {
  it('loads from the module API client and reports loading then items', async () => {
    const { wrapper } = mount(BASE, null)
    const { result } = renderHook(() => productModule.useTodayItems!(), { wrapper })
    expect(result.current.loading).toBe(true)
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.items.length).toBeGreaterThan(0)
    for (const item of result.current.items) {
      expect(item.to.startsWith('/items/')).toBe(true)
      expect(['info', 'warn', 'danger']).toContain(item.severity)
    }
  })

  it('returns no items, and stops loading, when the service fails', async () => {
    const failing: typeof fetch = () =>
      Promise.resolve(
        new Response(JSON.stringify({ title: 'x', status: 500 }), {
          status: 500,
          headers: { 'content-type': 'application/problem+json' },
        }),
      )
    const { wrapper } = mount(BASE, null, failing)
    const { result } = renderHook(() => productModule.useTodayItems!(), { wrapper })
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.items).toEqual([])
  })
})

describe('module caches', () => {
  it('uses the api client it is given, never a fixed address', async () => {
    const seen: string[] = []
    const spy: typeof fetch = (input, init) => {
      seen.push(typeof input === 'string' ? input : input instanceof URL ? input.href : input.url)
      return createDemoFetch()(input, init)
    }
    renderMounted(BASE, spy)
    await screen.findByRole('group', { name: 'Waiting items' })
    expect(seen.length).toBeGreaterThan(0)
    for (const url of seen) expect(url.startsWith('http://gw.test/api/waiting-on/v1/')).toBe(true)
  })
})
