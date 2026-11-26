import { ApiProvider, createApiClient } from '@platform/api-client'
import { ThemeProvider, ToastProvider } from '@platform/ui'
import { ModuleBaseProvider } from '@platform/workspace-kit'
import { QueryClient } from '@tanstack/react-query'
import { render, renderHook, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Fragment, type ReactNode } from 'react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { describe, expect, it } from 'vitest'
import { productModule } from './module'
import { createMockApi } from './mock/mockApi'
import { clock } from './test/setup'

const BASE = '/app/home-pulse'
const ModuleProviders = productModule.Providers ?? Fragment
const urlOf = (input: RequestInfo | URL): string =>
  typeof input === 'string' ? input : input instanceof URL ? input.href : input.url
const FRIDGE = '00000000-0000-4000-8000-000000000001'

/** What the workspace does around a module: router, base, its own API client and cache. */
function Workspace({
  path,
  children,
  fetchImpl,
}: {
  path: string
  children: ReactNode
  fetchImpl: typeof fetch
}) {
  const client = createApiClient({
    baseUrl: 'http://gateway.test/api/home-pulse',
    getToken: () => Promise.resolve('token'),
    fetch: fetchImpl,
  })
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  })
  return (
    <MemoryRouter initialEntries={[path]}>
      <ThemeProvider>
        <ApiProvider client={client} queryClient={queryClient}>
          <ToastProvider>
            <Routes>
              <Route
                path={`${BASE}/*`}
                element={
                  <ModuleBaseProvider base={BASE}>
                    <ModuleProviders>{children}</ModuleProviders>
                  </ModuleBaseProvider>
                }
              />
            </Routes>
          </ToastProvider>
        </ApiProvider>
      </ThemeProvider>
    </MemoryRouter>
  )
}

describe('productModule metadata', () => {
  it('has the identity the workspace registry expects', () => {
    expect(productModule.id).toBe('home-pulse')
    expect(productModule.service).toBe('home-pulse')
    expect(productModule.title).toBe('Home Pulse')
    expect(productModule.requiredPermission).toBeUndefined()
    expect(productModule.tagline).not.toBe('')
    expect(productModule.description).not.toMatch(/TODO|lorem/i)
    expect(productModule.accent).toBe('var(--pp-color-product-home-pulse)')
    expect(typeof productModule.icon).toBe('function')
    expect(typeof productModule.Routes).toBe('function')
    expect(typeof productModule.Providers).toBe('function')
    expect(typeof productModule.useTodayItems).toBe('function')
    expect(typeof productModule.createDemoFetch).toBe('function')
  })

  it('declares navigation relative to the module base, each with an icon', () => {
    expect(productModule.nav.map((n) => [n.label, n.to])).toEqual([
      ['Home', '/'],
      ['Alerts', '/alerts'],
      ['Devices', '/devices'],
      ['Reminders', '/reminders'],
    ])
    expect(productModule.nav[0]?.end).toBe(true)
    for (const item of productModule.nav) {
      expect(item.to.startsWith('/')).toBe(true)
      expect(item.icon).toBeTypeOf('function')
    }
  })
})

describe('createDemoFetch', () => {
  it('returns a working in-memory API behind the gateway path, and needs a token', async () => {
    const demo = productModule.createDemoFetch?.()
    expect(demo).toBeTypeOf('function')
    const url = 'http://gateway.test/api/home-pulse/v1/appliances'
    const denied = await demo?.(url)
    expect(denied?.status).toBe(401)
    const ok = await demo?.(url, { headers: { authorization: 'Bearer demo' } })
    expect(ok?.status).toBe(200)
    const list = (await ok?.json()) as { name: string }[]
    expect(list.map((a) => a.name)).toContain('Kitchen fridge')
  })

  it('gives every call its own mock, so two modules never share demo state', () => {
    const a = productModule.createDemoFetch?.()
    const b = productModule.createDemoFetch?.()
    expect(a).not.toBe(b)
  })
})

describe('links under a module base', () => {
  async function hrefsAt(path: string, ready: () => Promise<unknown>) {
    const mock = createMockApi({ clock })
    const Routes = productModule.Routes
    const { container } = render(
      <Workspace path={path} fetchImpl={mock.fetch}>
        <Routes />
      </Workspace>,
    )
    await ready()
    return [...container.querySelectorAll('a')].map((a) => a.getAttribute('href') ?? '')
  }

  it.each([
    [`${BASE}`, () => screen.findByRole('link', { name: 'Kitchen fridge' })],
    [`${BASE}/alerts`, () => screen.findAllByText(/draws 14% more power/)],
    [`${BASE}/reminders`, () => screen.findAllByText(/Claim window/)],
    [`${BASE}/devices`, () => screen.findAllByRole('link', { name: 'Garden water pump' })],
    [`${BASE}/appliances/${FRIDGE}`, () => screen.findByRole('link', { name: 'Edit' })],
    [
      `${BASE}/appliances/${FRIDGE}/edit`,
      () => screen.findByRole('link', { name: 'Back to appliance' }),
    ],
    [`${BASE}/nowhere`, () => screen.findByRole('link', { name: 'Go to your appliances' })],
  ])('every link on %s starts with the base', async (path, ready) => {
    const hrefs = await hrefsAt(path, ready)
    expect(hrefs.length).toBeGreaterThan(0)
    for (const href of hrefs) expect(href.startsWith(BASE)).toBe(true)
  })

  it('navigates inside the base: add appliance, cancel, and the old /home redirect', async () => {
    const mock = createMockApi({ clock })
    const Routes = productModule.Routes
    const user = userEvent.setup()
    render(
      <Workspace path={`${BASE}/home`} fetchImpl={mock.fetch}>
        <Routes />
      </Workspace>,
    )
    // /home redirects to the base, not to the workspace root
    await screen.findByRole('link', { name: 'Kitchen fridge' })
    await user.click(screen.getByRole('link', { name: 'Add appliance' }))
    await screen.findByRole('heading', { name: 'Add an appliance' })
    await user.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(await screen.findByRole('link', { name: 'Kitchen fridge' })).toBeInTheDocument()
  })

  it('uses the API client it is given, bound to the gateway path', async () => {
    const urls: string[] = []
    const mock = createMockApi({ clock })
    const Routes = productModule.Routes
    render(
      <Workspace
        path={BASE}
        fetchImpl={(input, init) => {
          urls.push(urlOf(input))
          return mock.fetch(input, init)
        }}
      >
        <Routes />
      </Workspace>,
    )
    await screen.findByRole('link', { name: 'Kitchen fridge' })
    expect(urls.length).toBeGreaterThan(0)
    for (const url of urls) expect(url).toMatch(/^http:\/\/gateway\.test\/api\/home-pulse\/v1\//)
  })
})

describe('home when the alert check fails', () => {
  it('says so, keeps the appliance cards, and retries', async () => {
    const mock = createMockApi({ clock })
    let failing = true
    const Routes = productModule.Routes
    const user = userEvent.setup()
    render(
      <Workspace
        path={BASE}
        fetchImpl={(input, init) => {
          if (failing && urlOf(input).includes('/v1/alerts'))
            return Promise.resolve(
              new Response(JSON.stringify({ detail: 'Alerts are down' }), {
                status: 500,
                headers: { 'content-type': 'application/problem+json' },
              }),
            )
          return mock.fetch(input, init)
        }}
      >
        <Routes />
      </Workspace>,
    )
    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent('Could not check your alerts')
    expect(await screen.findByRole('link', { name: 'Kitchen fridge' })).toBeInTheDocument()
    failing = false
    await user.click(within(alert).getByRole('button', { name: 'Try again' }))
    expect(await screen.findByRole('region', { name: /need your attention/ })).toBeInTheDocument()
  })

  it('opens the device page in the workspace', async () => {
    const mock = createMockApi({ clock })
    const Routes = productModule.Routes
    render(
      <Workspace path={`${BASE}/devices`} fetchImpl={mock.fetch}>
        <Routes />
      </Workspace>,
    )
    expect(await screen.findByRole('table', { name: 'Devices' })).toBeInTheDocument()
  })
})

describe('useTodayItems', () => {
  it('reads open alerts, warranties and services from the module API', async () => {
    const mock = createMockApi({ clock })
    const useTodayItems = productModule.useTodayItems
    if (!useTodayItems) throw new Error('missing useTodayItems')
    const { result } = renderHook(() => useTodayItems(), {
      wrapper: ({ children }) => (
        <Workspace path={BASE} fetchImpl={mock.fetch}>
          {children}
        </Workspace>
      ),
    })
    expect(result.current.loading).toBe(true)
    await waitFor(() => expect(result.current.loading).toBe(false))
    const items = result.current.items
    // demo data: a critical stuck pump, a warning on the fridge, the fridge warranty ending in 85 days (not due yet),
    // an overdue pump service and an AC service in 20 days (not due yet)
    expect(items[0]).toMatchObject({
      severity: 'danger',
      to: expect.stringMatching(/^\/appliances\//),
    })
    expect(items.map((i) => i.id)).toEqual(
      expect.arrayContaining([
        expect.stringMatching(/^alert-/),
        expect.stringMatching(/^service-/),
      ]),
    )
    expect(items.some((i) => i.id.startsWith('warranty-'))).toBe(false)
    for (const item of items) {
      expect(item.to.startsWith('/')).toBe(true)
      expect(['info', 'warn', 'danger']).toContain(item.severity)
      expect(item.dueAt).toBeTruthy()
    }
    expect(within(document.body).queryByRole('alert')).not.toBeInTheDocument()
  })
})
