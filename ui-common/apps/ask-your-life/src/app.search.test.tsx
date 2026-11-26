import { screen, waitFor, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { appReady, renderApp, runSearch, searchBox } from './test/renderApp'

const resultTitles = () => screen.queryAllByRole('heading', { level: 3 }).map((h) => h.textContent)

describe('search home', () => {
  it('opens on a focused, labelled search field with the three modes explained', async () => {
    renderApp()
    await appReady()
    expect(screen.getByRole('heading', { level: 1, name: 'Ask your life' })).toBeInTheDocument()
    // the field focuses itself just after mount; wait for it rather than racing it
    await waitFor(() => expect(searchBox()).toHaveFocus())
    expect(screen.getByRole('search', { name: 'Search your library' })).toBeInTheDocument()
    const modes = screen.getByRole('group', { name: 'Search mode' })
    expect(within(modes).getByRole('radio', { name: /Hybrid/ })).toBeChecked()
    expect(
      within(modes).getByText(/matches your exact words and passages with a similar meaning/),
    ).toBeInTheDocument()
    expect(within(modes).getByText(/Only passages containing your words/)).toBeInTheDocument()
    expect(within(modes).getByText(/mean something close to your question/)).toBeInTheDocument()
    expect(screen.getByText(/Only you can see what you add/)).toBeInTheDocument()
  })

  it('"/" focuses the search field from anywhere on the page, but not while typing elsewhere', async () => {
    const { user } = renderApp()
    await appReady()
    await user.click(screen.getByRole('heading', { level: 1 }))
    expect(searchBox()).not.toHaveFocus()
    await user.keyboard('/')
    expect(searchBox()).toHaveFocus()
    // The slash typed into the field is just text.
    await user.keyboard('a/b')
    expect(searchBox()).toHaveValue('a/b')
  })

  it('"/" from another page goes to search with the field focused', async () => {
    const { user } = renderApp({ route: '/library' })
    await screen.findByRole('heading', { level: 1, name: 'Library' })
    await user.click(screen.getByRole('heading', { level: 1 }))
    await user.keyboard('/')
    expect(
      await screen.findByRole('heading', { level: 1, name: 'Ask your life' }),
    ).toBeInTheDocument()
    expect(searchBox()).toHaveFocus()
  })

  it('hybrid search finds matching passages with highlighted terms and sends the right request', async () => {
    const { user, runtime } = renderApp()
    await appReady()
    await runSearch(user, 'smoke detector')
    expect(
      await screen.findByRole('heading', { level: 2, name: /2 results for/ }),
    ).toBeInTheDocument()
    expect(resultTitles()).toEqual(
      expect.arrayContaining(['Hardware store receipt', 'Apartment lease: 14 Elm Street']),
    )
    const marks = screen.getAllByText(/smoke|detector/i, { selector: 'mark' })
    expect(marks.length).toBeGreaterThanOrEqual(2)
    expect(runtime.mock?.requests).toContain(
      'GET /v1/search?q=smoke+detector&k=10&mode=hybrid&debug=true',
    )
    expect(screen.getByRole('searchbox')).toHaveValue('smoke detector')
  })

  it('keyword mode needs the exact words; semantic mode finds the same thing by meaning', async () => {
    const { user, runtime } = renderApp()
    await appReady()
    await user.click(screen.getByRole('radio', { name: /Keyword/ }))
    await runSearch(user, 'vehicle cost')
    expect(
      await screen.findByRole('heading', { name: /Nothing matched "vehicle cost"/ }),
    ).toBeInTheDocument()
    expect(runtime.mock?.requests.at(-1)).toContain('mode=keyword')

    await user.click(screen.getByRole('radio', { name: /Semantic/ }))
    expect(
      await screen.findByRole('heading', { level: 3, name: 'Car repair invoice' }),
    ).toBeInTheDocument()
    expect(runtime.mock?.requests.at(-1)).toContain('mode=semantic')
    expect(screen.queryByRole('heading', { name: /Nothing matched/ })).not.toBeInTheDocument()
  })

  it('keyword search understands "quotes" and -exclusions', async () => {
    const { user } = renderApp()
    await appReady()
    await user.click(screen.getByRole('radio', { name: /Keyword/ }))
    await runSearch(user, '"smoke detector" -paint')
    expect(
      await screen.findByRole('heading', { level: 3, name: 'Apartment lease: 14 Elm Street' }),
    ).toBeInTheDocument()
    expect(resultTitles()).not.toContain('Hardware store receipt')
  })

  it('shows helpful suggestions when nothing matches, and the suggestions work', async () => {
    const { user } = renderApp()
    await appReady()
    await user.click(screen.getByRole('radio', { name: /Keyword/ }))
    await user.click(screen.getByRole('button', { name: 'Filters' }))
    await user.click(screen.getByRole('checkbox', { name: 'Email' }))
    await runSearch(user, 'smoke detector')
    const empty = await screen.findByRole('region', { name: /Nothing matched "smoke detector"/ })
    expect(within(empty).getByText(/Keyword search needs your exact words/)).toBeInTheDocument()
    expect(within(empty).getByText(/Your filters may be hiding results/)).toBeInTheDocument()
    expect(within(empty).getByRole('link', { name: 'Library' })).toHaveAttribute('href', '/library')
    expect(within(empty).getByRole('link', { name: 'Add a note or file' })).toHaveAttribute(
      'href',
      '/add',
    )

    await user.click(
      within(empty).getAllByRole('button', { name: 'Clear filters' })[0] as HTMLElement,
    )
    expect(
      await screen.findByRole('heading', { level: 2, name: /2 results for/ }),
    ).toBeInTheDocument()
    expect(screen.getByRole('checkbox', { name: 'Email' })).not.toBeChecked()
  })

  it('offers hybrid search from a semantic dead end', async () => {
    const { user } = renderApp()
    await appReady()
    await user.click(screen.getByRole('radio', { name: /Semantic/ }))
    await runSearch(user, 'qwertyuiop')
    const empty = await screen.findByRole('region', { name: /Nothing matched/ })
    await user.click(within(empty).getByRole('button', { name: 'Hybrid search' }))
    expect(screen.getByRole('radio', { name: /Hybrid/ })).toBeChecked()
  })

  it('restores a search from the address and shows example searches when idle', async () => {
    renderApp({ route: '/?q=lease&mode=keyword' })
    expect(
      await screen.findByRole('heading', { level: 3, name: 'Apartment lease: 14 Elm Street' }),
    ).toBeInTheDocument()
    expect(screen.getByRole('radio', { name: /Keyword/ })).toBeChecked()
    expect(searchBox()).toHaveValue('lease')
  })

  it('example searches run when clicked', async () => {
    const { user } = renderApp()
    await appReady()
    await user.click(await screen.findByRole('button', { name: 'car insurance' }))
    expect(
      await screen.findByRole('heading', { level: 3, name: 'Car insurance policy summary' }),
    ).toBeInTheDocument()
  })

  it('shows the cited, quoted answer above the results', async () => {
    const { user } = renderApp()
    await appReady()
    await runSearch(user, 'when is the rent due')
    const answer = await screen.findByRole('region', { name: 'From your documents' })
    expect(
      within(answer).getByText('Monthly rent is $1,850, due on the first of the month.'),
    ).toBeInTheDocument()
    const source = within(answer).getByRole('link', { name: 'Apartment lease: 14 Elm Street' })
    expect(source.getAttribute('href')).toContain('/library?open=')
    expect(within(answer).getByText(/not written by an AI/)).toBeInTheDocument()
  })

  it('does nothing for an empty query and keeps focus in the field', async () => {
    const { user, runtime } = renderApp()
    await appReady()
    await user.click(screen.getByRole('button', { name: 'Search' }))
    expect(searchBox()).toHaveFocus()
    expect(runtime.mock?.requests.some((r) => r.includes('/v1/search'))).toBe(false)
  })

  it('"Show more results" asks for 10 more', async () => {
    const seed = Array.from({ length: 12 }, (_, i) => ({
      title: `Alpha note ${i + 1}`,
      sourceType: 'NOTE' as const,
      mimeType: 'text/plain',
      text: `alpha beta ${i}`,
      createdAt: '2026-02-01T00:00:00.000Z',
    }))
    const { user, runtime } = renderApp({ mock: { seed } })
    await appReady()
    await runSearch(user, 'alpha')
    expect(await screen.findByRole('heading', { level: 2, name: /10 results/ })).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Show more results' }))
    expect(await screen.findByRole('heading', { level: 2, name: /12 results/ })).toBeInTheDocument()
    expect(runtime.mock?.requests.at(-1)).toContain('k=20')
    expect(screen.queryByRole('button', { name: 'Show more results' })).not.toBeInTheDocument()
  })
})
