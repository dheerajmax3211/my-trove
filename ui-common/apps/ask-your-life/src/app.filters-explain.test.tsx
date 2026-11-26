import { screen, waitFor, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { intercept, jsonResponse, problemResponse } from './test/fetchHelpers'
import { appReady, renderApp, runSearch } from './test/renderApp'

describe('filters', () => {
  it('source type and date range end up in the query string', async () => {
    const { user, runtime } = renderApp()
    await appReady()
    await user.click(screen.getByRole('button', { name: 'Filters' }))
    await user.click(screen.getByRole('checkbox', { name: 'Receipt' }))
    await user.click(screen.getByRole('checkbox', { name: 'Note' }))
    await user.type(screen.getByLabelText('From'), '2026-05-01')
    await user.type(screen.getByLabelText('To'), '2026-06-30')
    await runSearch(user, 'total')
    expect(
      await screen.findByRole('heading', { level: 3, name: 'Car repair invoice' }),
    ).toBeInTheDocument()
    const request = runtime.mock?.requests.at(-1) ?? ''
    const params = new URLSearchParams(request.split('?')[1])
    expect(params.getAll('sourceType')).toEqual(['NOTE', 'RECEIPT'])
    expect(params.get('from')).toBe(new Date(2026, 4, 1).toISOString())
    expect(params.get('to')).toBe(new Date(2026, 6, 1).toISOString())
    expect(screen.getByRole('button', { name: 'Filters (4)' })).toBeInTheDocument()
    // Only receipts inside May-June match.
    expect(
      screen
        .getAllByRole('heading', { level: 3 })
        .map((h) => h.textContent)
        .sort(),
    ).toEqual(['Car repair invoice', 'Hardware store receipt'])
  })

  it('refuses a backwards date range and says why, without searching', async () => {
    const { user, runtime } = renderApp()
    await appReady()
    await user.click(screen.getByRole('button', { name: 'Filters' }))
    await user.type(screen.getByLabelText('From'), '2026-06-30')
    await user.type(screen.getByLabelText('To'), '2026-05-01')
    await runSearch(user, 'service')
    expect(await screen.findByText('The start date is after the end date.')).toBeInTheDocument()
    expect(runtime.mock?.requests.some((r) => r.includes('/v1/search'))).toBe(false)
    expect(screen.getByLabelText('To')).toBeInvalid()
  })

  it('filters survive a reload from the address bar', async () => {
    renderApp({ route: '/?q=service&type=RECEIPT' })
    expect(
      await screen.findByRole('heading', { level: 3, name: 'Car repair invoice' }),
    ).toBeInTheDocument()
    expect(screen.getByRole('checkbox', { name: 'Receipt' })).toBeChecked()
  })
})

describe('why this result', () => {
  it('explains keyword and meaning ranks in plain language, then returns focus to its button', async () => {
    const { user } = renderApp()
    await appReady()
    await runSearch(user, 'vehicle cost')
    const trigger = await screen.findByRole('button', {
      name: 'Why this result: Car repair invoice',
    })
    await user.click(trigger)
    const dialog = await screen.findByRole('dialog', { name: 'Why this result' })
    expect(within(dialog).getByText(/Found by similar meaning only/)).toBeInTheDocument()
    expect(within(dialog).getByText('Keyword rank').nextSibling).toHaveTextContent('Not listed')
    expect(within(dialog).getByText('Meaning rank').nextSibling).toHaveTextContent(/#\d/)
    expect(within(dialog).getByText(/1\/\(60 \+ \d+\)/)).toBeInTheDocument()
    await user.keyboard('{Escape}')
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    expect(trigger).toHaveFocus()
  })

  it('shows both ranks when both lists found the passage', async () => {
    const { user } = renderApp()
    await appReady()
    await runSearch(user, 'smoke detector')
    await user.click(
      await screen.findByRole('button', { name: 'Why this result: Hardware store receipt' }),
    )
    const dialog = await screen.findByRole('dialog', { name: 'Why this result' })
    expect(
      within(dialog).getByText(/both your exact words and similar meaning/),
    ).toBeInTheDocument()
    expect(within(dialog).getByText('Keyword rank').nextSibling).toHaveTextContent(/#\d/)
    expect(within(dialog).getByText('Meaning rank').nextSibling).toHaveTextContent(/#\d/)
  })
})

describe('highlight safety end to end', () => {
  const hostile = {
    query: 'x',
    mode: 'HYBRID',
    k: 10,
    debug: { rrfK: 60, fusion: '', candidatePool: 100 },
    hits: [
      {
        documentId: 'd1',
        chunkId: 'c1',
        title: '<img src=x onerror=alert(1)> title',
        sourceType: 'NOTE',
        createdAt: '2026-02-01T00:00:00Z',
        chunkOrdinal: 0,
        snippet:
          '<mark>real</mark> &lt;script&gt;window.__pwned=1&lt;/script&gt; <img src=x onerror="window.__pwned=2"> &lt;mark&gt;fake&lt;/mark&gt; <a href="javascript:1">x</a>',
        score: 0.03,
        explain: { ftsRank: 1, semanticRank: null, ftsScore: 1, semanticSimilarity: null },
      },
    ],
  }

  it('renders hostile snippets and titles as text, with only genuine matches highlighted', async () => {
    const { user, container } = renderApp({
      wrapFetch: intercept('/v1/search', () => jsonResponse(hostile)),
    })
    await appReady()
    await runSearch(user, 'x')
    const card = await screen.findByRole('article')
    expect(container.querySelector('img, script, iframe')).toBeNull()
    expect(card.querySelectorAll('a')).toHaveLength(1) // only "Open in library"
    const marks = card.querySelectorAll('mark')
    expect([...marks].map((m) => m.textContent)).toEqual(['real'])
    expect(card).toHaveTextContent('<script>window.__pwned=1</script>')
    expect(card).toHaveTextContent('<mark>fake</mark>')
    expect(card).toHaveTextContent('<img src=x onerror=alert(1)> title')
    expect((window as unknown as { __pwned?: number }).__pwned).toBeUndefined()
  })
})

describe('search errors', () => {
  it('shows a readable message with Try again, and recovers', async () => {
    let failing = true
    const { user } = renderApp({
      wrapFetch: intercept('/v1/search', () =>
        failing
          ? problemResponse(500, 'Internal Server Error', 'The search index is warming up.')
          : null,
      ),
    })
    await appReady()
    await runSearch(user, 'lease')
    const alert = await screen.findByRole('alert')
    expect(within(alert).getByText('Search failed')).toBeInTheDocument()
    expect(within(alert).getByText('The search index is warming up.')).toBeInTheDocument()
    failing = false
    await user.click(within(alert).getByRole('button', { name: 'Try again' }))
    expect(
      await screen.findByRole('heading', { level: 3, name: 'Apartment lease: 14 Elm Street' }),
    ).toBeInTheDocument()
  })

  it('explains an offline failure', async () => {
    const { user } = renderApp({
      wrapFetch: intercept('/v1/search', () => Promise.reject(new TypeError('Failed to fetch'))),
    })
    await appReady()
    await runSearch(user, 'lease')
    expect(await screen.findByText(/could not reach the server/i)).toBeInTheDocument()
  })
})
