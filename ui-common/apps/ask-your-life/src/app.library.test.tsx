import { screen, waitFor, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import type { SeedDocument } from './mock/seed'
import { intercept, problemResponse } from './test/fetchHelpers'
import { appReady, renderApp, runSearch } from './test/renderApp'

const row = (title: string) => screen.getByRole('row', { name: new RegExp(title) })

describe('library', () => {
  it('lists documents with source, status, passages and date', async () => {
    renderApp({ route: '/library' })
    const receipt = await screen.findByRole('row', { name: /Hardware store receipt/ })
    expect(within(receipt).getByText('Receipt')).toBeInTheDocument()
    expect(within(receipt).getByText('Ready')).toBeInTheDocument()
    expect(within(receipt).getByText('May 18, 2026')).toBeInTheDocument()
    expect(within(receipt).getByRole('cell', { name: '1' })).toBeInTheDocument()
    expect(screen.getByRole('table', { name: 'Your documents' })).toBeInTheDocument()
  })

  it('filters by source through the API', async () => {
    const { user, runtime } = renderApp({ route: '/library' })
    await screen.findByRole('row', { name: /Hardware store receipt/ })
    await user.selectOptions(screen.getByLabelText('Show'), 'RECEIPT')
    await waitFor(() =>
      expect(screen.queryByRole('row', { name: /Trip planning/ })).not.toBeInTheDocument(),
    )
    expect(row('Car repair invoice')).toBeInTheDocument()
    expect(runtime.mock?.requests.at(-1)).toContain('sourceType=RECEIPT')
  })

  it('pages through long libraries', async () => {
    const seed: SeedDocument[] = Array.from({ length: 30 }, (_, i) => ({
      title: `Doc ${String(i).padStart(2, '0')}`,
      sourceType: 'NOTE',
      mimeType: 'text/plain',
      text: `text ${i}`,
      createdAt: new Date(Date.UTC(2026, 0, 1, 0, i)).toISOString(),
    }))
    const { user, runtime } = renderApp({ route: '/library', mock: { seed } })
    await screen.findByRole('row', { name: /Doc 29/ })
    expect(screen.getByRole('button', { name: 'Previous' })).toBeDisabled()
    await user.click(screen.getByRole('button', { name: 'Next' }))
    await screen.findByRole('row', { name: /Doc 04/ })
    expect(screen.queryByRole('row', { name: /Doc 29/ })).not.toBeInTheDocument()
    expect(runtime.mock?.requests.at(-1)).toContain('offset=25')
    expect(screen.getByRole('button', { name: 'Next' })).toBeDisabled()
    await user.click(screen.getByRole('button', { name: 'Previous' }))
    await screen.findByRole('row', { name: /Doc 29/ })
  })

  it('opens a document to see what is stored, and the text is never shown', async () => {
    const { user } = renderApp({ route: '/library' })
    await user.click(await screen.findByRole('button', { name: 'Apartment lease: 14 Elm Street' }))
    const dialog = await screen.findByRole('dialog', { name: 'Apartment lease: 14 Elm Street' })
    expect(await within(dialog).findByText('Searchable passages')).toBeInTheDocument()
    expect(within(dialog).getByText('text/markdown')).toBeInTheDocument()
    expect(within(dialog).getByText(/You can find it with search/)).toBeInTheDocument()
    expect(within(dialog).queryByText(/escrow/)).not.toBeInTheDocument()
    await user.keyboard('{Escape}')
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
  })

  it('"Open in library" from a search result opens that document', async () => {
    const { user } = renderApp()
    await appReady()
    await runSearch(user, 'dentist cavity')
    await user.click(await screen.findByRole('link', { name: /Open in library/ }))
    expect(
      await screen.findByRole('dialog', { name: 'Dentist appointment notes' }),
    ).toBeInTheDocument()
  })

  it('replaces the content of a document; the new text becomes findable', async () => {
    const { user } = renderApp({ route: '/library' })
    await user.click(await screen.findByRole('button', { name: 'Hardware store receipt' }))
    const dialog = await screen.findByRole('dialog', { name: 'Hardware store receipt' })
    await user.click(await within(dialog).findByText('Replace content', { selector: 'summary' }))
    const form = within(dialog).getByRole('form', { name: 'Replace content' })
    await user.click(within(form).getByRole('button', { name: 'Replace content' }))
    expect(await within(form).findByText(/Paste the new text/)).toBeInTheDocument()
    await user.type(
      within(form).getByLabelText(/^New text/),
      'Ridgeline Hardware. Paintbrush set $12.',
    )
    await user.click(within(form).getByRole('button', { name: 'Replace content' }))
    expect((await screen.findAllByText('Content replaced')).length).toBeGreaterThan(0)
    await waitFor(() =>
      expect(within(dialog).getByText(/You can find it with search/)).toBeInTheDocument(),
    )
    await user.click(within(dialog).getAllByRole('button', { name: 'Close' }).at(-1) as HTMLElement)
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    await user.click(screen.getByRole('link', { name: 'Search' }))
    await runSearch(user, 'paintbrush')
    expect(
      await screen.findByRole('heading', { level: 3, name: 'Hardware store receipt' }),
    ).toBeInTheDocument()
  })

  it('says nothing changed when the replacement text is identical', async () => {
    const seed: SeedDocument[] = [
      {
        title: 'Same',
        sourceType: 'NOTE',
        mimeType: 'text/plain',
        text: 'unchanged text',
        createdAt: '2026-01-01T00:00:00Z',
      },
    ]
    const { user } = renderApp({ route: '/library', mock: { seed } })
    await user.click(await screen.findByRole('button', { name: 'Same' }))
    const dialog = await screen.findByRole('dialog', { name: 'Same' })
    await user.click(await within(dialog).findByText('Replace content', { selector: 'summary' }))
    const form = within(dialog).getByRole('form', { name: 'Replace content' })
    await user.type(within(form).getByLabelText(/^New text/), 'unchanged text')
    await user.click(within(form).getByRole('button', { name: 'Replace content' }))
    expect((await screen.findAllByText('Nothing changed')).length).toBeGreaterThan(0)
  })

  it('asks before deleting, can be cancelled, and deleted documents are no longer found', async () => {
    const { user, runtime } = renderApp({ route: '/library' })
    await user.click(await screen.findByRole('button', { name: 'Delete Hardware store receipt' }))
    let dialog = await screen.findByRole('dialog', { name: 'Delete this document?' })
    expect(dialog).toHaveTextContent('This cannot be undone')
    await user.click(within(dialog).getByRole('button', { name: 'Cancel' }))
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    expect(row('Hardware store receipt')).toBeInTheDocument()
    expect(runtime.mock?.requests.some((r) => r.startsWith('DELETE'))).toBe(false)

    await user.click(screen.getByRole('button', { name: 'Delete Hardware store receipt' }))
    dialog = await screen.findByRole('dialog', { name: 'Delete this document?' })
    await user.click(within(dialog).getByRole('button', { name: 'Delete' }))
    await waitFor(() =>
      expect(screen.queryByRole('row', { name: /Hardware store receipt/ })).not.toBeInTheDocument(),
    )
    expect((await screen.findAllByText('Deleted')).length).toBeGreaterThan(0)
    expect(runtime.mock?.requests.some((r) => r.startsWith('DELETE /v1/documents/'))).toBe(true)

    await user.click(screen.getByRole('link', { name: 'Search' }))
    await runSearch(user, 'smoke detector')
    await screen.findByRole('heading', { level: 3, name: 'Apartment lease: 14 Elm Street' })
    expect(
      screen.queryByRole('heading', { level: 3, name: 'Hardware store receipt' }),
    ).not.toBeInTheDocument()
  })

  it('shows a failed delete in the dialog', async () => {
    const { user } = renderApp({
      route: '/library',
      wrapFetch: (mockFetch) => (input, init) =>
        init?.method === 'DELETE'
          ? Promise.resolve(
              new Response(
                JSON.stringify({ title: 'Not Found', status: 404, detail: 'Document not found' }),
                {
                  status: 404,
                  headers: { 'content-type': 'application/problem+json' },
                },
              ),
            )
          : mockFetch(input, init),
    })
    await user.click(await screen.findByRole('button', { name: 'Delete Car repair invoice' }))
    const dialog = await screen.findByRole('dialog', { name: 'Delete this document?' })
    await user.click(within(dialog).getByRole('button', { name: 'Delete' }))
    expect(await within(dialog).findByRole('alert')).toHaveTextContent('Document not found')
  })

  it('polls the list until pending documents are ready', async () => {
    const { user } = renderApp({ route: '/add' })
    await appReady()
    await user.type(screen.getByRole('textbox', { name: /^Note/ }), 'Queue me up')
    await user.click(screen.getByRole('button', { name: 'Save note' }))
    await screen.findByRole('heading', { level: 3, name: 'Queue me up' })
    await user.click(screen.getByRole('link', { name: 'Library' }))
    const created = await screen.findByRole('row', { name: /Queue me up/ })
    await waitFor(() => expect(within(row('Queue me up')).getByText('Ready')).toBeInTheDocument())
    expect(created).toBeInTheDocument()
  })

  it('has a helpful empty state', async () => {
    renderApp({ route: '/library', mock: { seed: false } })
    expect(
      await screen.findByRole('heading', { name: 'Your library is empty' }),
    ).toBeInTheDocument()
    expect(screen.getByText(/Only you can see them/)).toBeInTheDocument()
    expect(screen.getAllByRole('link', { name: /Add/ }).length).toBeGreaterThan(0)
  })

  it('reports a load failure with retry', async () => {
    let failing = true
    const { user } = renderApp({
      route: '/library',
      wrapFetch: intercept('/v1/documents', () =>
        failing ? problemResponse(503, 'Service Unavailable', 'Try again shortly.') : null,
      ),
    })
    expect(await screen.findByText('Could not load your library')).toBeInTheDocument()
    expect(screen.getByText('Try again shortly.')).toBeInTheDocument()
    failing = false
    await user.click(screen.getByRole('button', { name: 'Try again' }))
    expect(await screen.findByRole('row', { name: /Car repair invoice/ })).toBeInTheDocument()
  })
})

describe('first use and navigation', () => {
  it('explains privacy and points to adding content when the library is empty', async () => {
    const { user } = renderApp({ mock: { seed: false } })
    const heading = await screen.findByRole('heading', { name: 'Only you can see this' })
    expect(heading).toBeInTheDocument()
    expect(screen.getByText(/nobody else can read, search or see them/)).toBeInTheDocument()
    await user.click(screen.getByRole('link', { name: 'Add your first note' }))
    expect(
      await screen.findByRole('heading', { level: 1, name: 'Add content' }),
    ).toBeInTheDocument()
  })

  it('has landmarks and navigates between the three screens', async () => {
    const { user } = renderApp()
    await appReady()
    expect(screen.getByRole('main')).toBeInTheDocument()
    await user.click(screen.getByRole('link', { name: 'Library' }))
    expect(await screen.findByRole('heading', { level: 1, name: 'Library' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Library' })).toHaveAttribute('aria-current', 'page')
    await user.click(
      within(screen.getByRole('navigation', { name: 'Workspace' })).getByRole('link', {
        name: 'Add content',
      }),
    )
    expect(
      await screen.findByRole('heading', { level: 1, name: 'Add content' }),
    ).toBeInTheDocument()
  })
})
