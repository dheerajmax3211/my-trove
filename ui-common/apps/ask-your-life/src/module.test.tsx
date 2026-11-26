import { ApiProvider, createApiClient } from '@platform/api-client'
import { QueryClient } from '@tanstack/react-query'
import { render, screen, waitFor, within } from '@testing-library/react'
import { useEffect } from 'react'
import { describe, expect, it } from 'vitest'
import type { DocumentResponse } from './features/documents/api/types'
import { MAX_TODAY_ITEMS, todayItemsFor } from './features/documents/lib/today'
import { useTodayItems } from './features/documents/hooks/useTodayItems'
import { productModule } from './module'
import { allHrefs, BASE, renderModule } from './test/renderModule'
import { intercept, jsonResponse, problemResponse } from './test/fetchHelpers'
import { appReady, renderApp, runSearch } from './test/renderApp'

const doc = (over: Partial<DocumentResponse> & { id: string }): DocumentResponse => ({
  sourceType: 'NOTE',
  externalId: null,
  title: `Doc ${over.id}`,
  mimeType: 'text/plain',
  contentHash: 'abc123abc123abc123',
  status: 'INDEXED',
  chunkCount: 1,
  createdAt: '2026-05-01T00:00:00Z',
  updatedAt: '2026-05-01T00:00:00Z',
  ingestedAt: '2026-05-01T00:00:01Z',
  ...over,
})

describe('productModule metadata', () => {
  it('has the identity the workspace registry expects', () => {
    expect(productModule.id).toBe('ask-your-life')
    expect(productModule.service).toBe('ask-your-life')
    expect(productModule.title).toBe('Ask Your Life')
    expect(productModule.accent).toBe('var(--pp-color-product-ask-your-life)')
    expect(productModule.requiredPermission).toBeUndefined()
    expect(typeof productModule.icon).toBe('function')
    expect(typeof productModule.Routes).toBe('function')
    expect(typeof productModule.Providers).toBe('function')
    expect(typeof productModule.useTodayItems).toBe('function')
    expect(typeof productModule.createDemoFetch).toBe('function')
  })

  it('declares the three screens, relative to the module base, each with an icon', () => {
    expect(productModule.nav.map((n) => [n.to, n.label])).toEqual([
      ['/', 'Search'],
      ['/add', 'Add content'],
      ['/library', 'Library'],
    ])
    expect(productModule.nav[0]?.end).toBe(true)
    for (const item of productModule.nav) {
      expect(item.to.startsWith('/')).toBe(true)
      expect(item.icon).toBeDefined()
    }
  })

  it('createDemoFetch returns a working in-memory API, also behind the gateway route', async () => {
    const f = productModule.createDemoFetch?.()
    expect(f).toBeDefined()
    const headers = { authorization: 'Bearer demo' }
    const direct = await f?.('http://localhost/api/v1/documents?limit=3', { headers })
    expect(direct?.status).toBe(200)
    const viaGateway = await f?.('http://localhost:8080/api/ask-your-life/v1/documents?limit=3', {
      headers,
    })
    expect(viaGateway?.status).toBe(200)
    expect(((await viaGateway?.json()) as unknown[]).length).toBe(3)
    const unauthorized = await f?.('http://localhost:8080/api/ask-your-life/v1/documents')
    expect(unauthorized?.status).toBe(401)
  })

  it('every call gets its own in-memory library', async () => {
    const headers = { authorization: 'Bearer demo' }
    const a = productModule.createDemoFetch?.()
    const b = productModule.createDemoFetch?.()
    await a?.('http://localhost/api/v1/documents', {
      method: 'POST',
      headers: { ...headers, 'content-type': 'application/json' },
      body: JSON.stringify({ text: 'only in a', title: 'Only A' }),
    })
    const list = async (f: typeof fetch | undefined) =>
      (await (await f?.('http://localhost/api/v1/documents', { headers }))?.json()) as unknown[]
    expect((await list(a)).length).toBe((await list(b)).length + 1)
  })
})

describe('todayItemsFor', () => {
  it('lists failures before indexing, with a link relative to the module', () => {
    const items = todayItemsFor([
      doc({ id: '1', status: 'INDEXED' }),
      doc({ id: '2', status: 'PENDING', title: 'Lease scan' }),
      doc({ id: '3', status: 'FAILED', title: 'Broken & odd' }),
    ])
    expect(items).toEqual([
      {
        id: 'failed-3',
        title: '"Broken & odd" could not be indexed',
        subtitle: 'Search cannot find it. Delete it and add it again.',
        severity: 'warn',
        to: '/library?open=3',
      },
      {
        id: 'indexing-2',
        title: 'Indexing "Lease scan"',
        subtitle: 'It becomes searchable in a few seconds.',
        severity: 'info',
        to: '/library?open=2',
      },
    ])
  })

  it('is empty when everything is searchable, and caps a long list', () => {
    expect(todayItemsFor([doc({ id: '1' })])).toEqual([])
    const many = Array.from({ length: 20 }, (_, i) => doc({ id: `p${i}`, status: 'PENDING' }))
    expect(todayItemsFor(many)).toHaveLength(MAX_TODAY_ITEMS)
  })

  it('encodes ids in the link', () => {
    expect(todayItemsFor([doc({ id: 'a b/c', status: 'FAILED' })])[0]?.to).toBe(
      '/library?open=a%20b%2Fc',
    )
  })
})

describe('useTodayItems', () => {
  function Probe({ onResult }: { onResult: (r: ReturnType<typeof useTodayItems>) => void }) {
    const result = useTodayItems()
    useEffect(() => {
      onResult(result)
    })
    return <p>{result.loading ? 'loading' : `${result.items.length} items`}</p>
  }

  const mount = (documents: DocumentResponse[]) => {
    const results: ReturnType<typeof useTodayItems>[] = []
    const client = createApiClient({
      baseUrl: 'http://gateway.test/api/ask-your-life',
      getToken: () => Promise.resolve('t'),
      fetch: () => Promise.resolve(jsonResponse(documents)),
    })
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    const view = render(
      <ApiProvider client={client} queryClient={queryClient}>
        <Probe onResult={(r) => results.push(r)} />
      </ApiProvider>,
    )
    return { results, view, client, queryClient }
  }

  it('reports loading, then the items from the library list', async () => {
    const { results } = mount([
      doc({ id: '1', status: 'FAILED', title: 'Bad file' }),
      doc({ id: '2', status: 'INDEXED' }),
    ])
    expect(results[0]?.loading).toBe(true)
    expect(await screen.findByText('1 items')).toBeInTheDocument()
    const last = results.at(-1)
    expect(last?.loading).toBe(false)
    expect(last?.items.map((i) => i.id)).toEqual(['failed-1'])
  })

  it('returns the same array while the documents have not changed', async () => {
    const { results, view, client, queryClient } = mount([doc({ id: '1', status: 'PENDING' })])
    await screen.findByText('1 items')
    const settled = results.at(-1)?.items
    view.rerender(
      <ApiProvider client={client} queryClient={queryClient}>
        <Probe onResult={(r) => results.push(r)} />
      </ApiProvider>,
    )
    expect(results.at(-1)?.items).toBe(settled)
  })

  it('reports no items for a healthy library', async () => {
    mount([doc({ id: '1' })])
    expect(await screen.findByText('0 items')).toBeInTheDocument()
  })
})

describe('mounted under a base (/app/ask-your-life)', () => {
  it('the home renders and every link stays inside the base', async () => {
    const { container } = renderModule()
    await screen.findByRole('heading', { level: 1, name: 'Ask your life' })
    await screen.findByRole('heading', { name: 'Recently added' })
    const hrefs = allHrefs(container)
    expect(hrefs.length).toBeGreaterThan(3)
    for (const href of hrefs) expect(href.startsWith(BASE)).toBe(true)
  })

  it('add, library and no-result pages keep their links inside the base', async () => {
    const add = renderModule({ route: `${BASE}/add` })
    await screen.findByRole('heading', { level: 1, name: 'Add content' })
    expect(allHrefs(add.container).every((h) => h.startsWith(BASE))).toBe(true)
    add.unmount()

    const library = renderModule({ route: `${BASE}/library` })
    await screen.findByRole('table', { name: 'Your documents' })
    expect(allHrefs(library.container).every((h) => h.startsWith(BASE))).toBe(true)
    library.unmount()

    const empty = renderModule({ route: `${BASE}/library`, mock: { seed: false } })
    const link = await screen.findByRole('link', { name: 'Add your first note' })
    expect(link).toHaveAttribute('href', `${BASE}/add`)
    expect(allHrefs(empty.container).every((h) => h.startsWith(BASE))).toBe(true)
    empty.unmount()

    const none = renderModule({ route: `${BASE}/?q=zzzzqqqq&mode=keyword` })
    const region = await screen.findByRole('region', { name: /Nothing matched/ })
    expect(within(region).getByRole('link', { name: 'Library' })).toHaveAttribute(
      'href',
      `${BASE}/library`,
    )
    expect(allHrefs(none.container).every((h) => h.startsWith(BASE))).toBe(true)
  })

  it('a search keeps ?q= in the address under the base, and result links stay inside it', async () => {
    const { user, container, requests } = renderModule()
    await screen.findByRole('heading', { name: 'Recently added' })
    const box = screen.getByRole('searchbox')
    await user.type(box, 'smoke detector')
    await user.click(screen.getByRole('button', { name: 'Search' }))
    await screen.findByRole('heading', { level: 3, name: 'Hardware store receipt' })
    expect(
      new URLSearchParams(screen.getByTestId('where').textContent?.split('?')[1]).get('q'),
    ).toBe('smoke detector')
    expect(requests).toContain('GET /v1/search?q=smoke+detector&k=10&mode=hybrid&debug=true')
    const open = screen.getAllByRole('link', { name: /Open in library/ })[0]
    expect(open?.getAttribute('href')).toMatch(new RegExp(`^${BASE}/library\\?open=`))
    expect(allHrefs(container).every((h) => h.startsWith(BASE))).toBe(true)
  })

  it('a ?q= link into the product runs that search', async () => {
    renderModule({ route: `${BASE}?q=lease&mode=keyword` })
    expect(
      await screen.findByRole('heading', { level: 3, name: 'Apartment lease: 14 Elm Street' }),
    ).toBeInTheDocument()
    expect(screen.getByRole('searchbox')).toHaveValue('lease')
  })

  it('"Search for it" after adding a note goes to the base with ?q=', async () => {
    const { user } = renderModule({ route: `${BASE}/add` })
    await screen.findByRole('heading', { level: 1, name: 'Add content' })
    await user.type(screen.getByRole('textbox', { name: /^Note/ }), 'Garage keypad is 4821')
    await user.click(screen.getByRole('button', { name: 'Save note' }))
    const link = await screen.findByRole('link', { name: 'Search for it' }, { timeout: 8000 })
    const href = link.getAttribute('href') ?? ''
    expect(href.startsWith(`${BASE}?q=`)).toBe(true)
    await user.click(link)
    await waitFor(() => expect(screen.getByRole('searchbox')).toHaveValue('Garage keypad is 4821'))
  }, 20_000)

  it('"/" from another page of the product goes to the base home and focuses search', async () => {
    const { user } = renderModule({ route: `${BASE}/library` })
    await screen.findByRole('table', { name: 'Your documents' })
    await user.click(screen.getByRole('heading', { level: 1 }))
    await user.keyboard('/')
    await screen.findByRole('searchbox')
    expect(screen.getByTestId('where')).toHaveTextContent(new RegExp(`^${BASE}/?$`))
    expect(screen.getByRole('searchbox')).toHaveFocus()
  })

  it('an unknown page inside the product goes back to its home, not the workspace root', async () => {
    renderModule({ route: `${BASE}/nope` })
    await screen.findByRole('searchbox')
    expect(screen.getByTestId('where')).toHaveTextContent(new RegExp(`^${BASE}/?$`))
  })

  it('talks to the gateway route through the client it was given', async () => {
    const urls: string[] = []
    renderModule({
      wrapFetch: (mockFetch) => (input, init) => {
        urls.push(typeof input === 'string' ? input : input instanceof URL ? input.href : input.url)
        return mockFetch(input, init)
      },
    })
    await screen.findByRole('heading', { name: 'Recently added' })
    expect(urls.length).toBeGreaterThan(0)
    for (const url of urls)
      expect(url.startsWith('http://gateway.test/api/ask-your-life/v1/')).toBe(true)
  })
})

describe('new home states', () => {
  it('populated: question box, examples, ways to look, recent searches and recently added', async () => {
    const { user } = renderApp()
    await appReady()
    expect(await screen.findByRole('group', { name: 'Try asking' })).toBeInTheDocument()
    expect(screen.getByRole('group', { name: 'Search mode' })).toBeInTheDocument()
    expect(await screen.findByRole('heading', { name: 'Recent searches' })).toBeInTheDocument()
    expect(screen.getByText(/on this device only/)).toBeInTheDocument()
    const added = screen.getByRole('region', { name: 'Recently added' })
    expect(within(added).getAllByRole('listitem').length).toBeLessThanOrEqual(5)
    expect(within(added).getByText('Tax documents checklist')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'car insurance' }))
    expect(
      await screen.findByRole('heading', { level: 3, name: 'Car insurance policy summary' }),
    ).toBeInTheDocument()
  })

  it('shows what is still indexing on the home, in words', async () => {
    renderApp({
      wrapFetch: intercept('/v1/documents', () =>
        jsonResponse([doc({ id: 'p1', status: 'PENDING', title: 'Fresh scan' })]),
      ),
    })
    const added = await screen.findByRole('region', { name: 'Recently added' })
    expect(within(added).getByText('Fresh scan')).toBeInTheDocument()
    expect(within(added).getByRole('status')).toHaveTextContent(
      '1 item is still being indexed. Search cannot find it yet.',
    )
  })

  it('empty: explains privacy, hides the search controls and prompts the first note', async () => {
    renderApp({ mock: { seed: false } })
    const region = await screen.findByRole('region', { name: 'Only you can see this' })
    expect(within(region).getByRole('list', { name: 'How it works' })).toBeInTheDocument()
    expect(within(region).getByRole('link', { name: 'Add your first note' })).toHaveAttribute(
      'href',
      '/add',
    )
    expect(screen.queryByRole('group', { name: 'Search mode' })).not.toBeInTheDocument()
    expect(screen.queryByRole('group', { name: 'Try asking' })).not.toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'Recent searches' })).not.toBeInTheDocument()
  })

  it('error: a library that cannot load leaves the question box usable and shows no home panels', async () => {
    renderApp({
      wrapFetch: intercept('/v1/documents', () =>
        problemResponse(503, 'Service Unavailable', 'Try again shortly.'),
      ),
    })
    await appReady()
    expect(screen.getByRole('searchbox')).toHaveFocus()
    expect(screen.queryByRole('heading', { name: 'Only you can see this' })).not.toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'Recently added' })).not.toBeInTheDocument()
    expect(screen.queryByRole('group', { name: 'Try asking' })).not.toBeInTheDocument()
  })

  it('recent searches are kept per person, can be run again and cleared', async () => {
    const { user } = renderApp()
    await appReady()
    await runSearch(user, 'smoke detector')
    await screen.findByRole('heading', { level: 2, name: /2 results for/ })
    expect(
      JSON.parse(window.localStorage.getItem('ask-your-life:recent:demo-user') ?? '[]'),
    ).toEqual(['smoke detector'])

    await user.click(screen.getByRole('link', { name: 'Search' }))
    const again = await screen.findByRole('button', { name: 'smoke detector' })
    await user.click(again)
    expect(
      await screen.findByRole('heading', { level: 2, name: /2 results for/ }),
    ).toBeInTheDocument()

    await user.click(screen.getByRole('link', { name: 'Search' }))
    await user.click(await screen.findByRole('button', { name: 'Clear' }))
    expect(screen.queryByRole('button', { name: 'smoke detector' })).not.toBeInTheDocument()
    expect(window.localStorage.getItem('ask-your-life:recent:demo-user')).toBeNull()
  })
})
