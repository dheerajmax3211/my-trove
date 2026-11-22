import { screen, waitFor, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { SEED_DOCUMENTS } from './mock/seed'
import { appReady, renderApp, runSearch } from './test/renderApp'

const trackedList = () => screen.getByRole('region', { name: 'Added this session' })

async function pasteNote(
  user: ReturnType<typeof renderApp>['user'],
  { title = '', text, externalId = '' }: { title?: string; text: string; externalId?: string },
) {
  const form = screen.getByRole('form', { name: 'Paste a note' })
  if (title) await user.type(within(form).getByLabelText('Title'), title)
  await user.type(within(form).getByRole('textbox', { name: /^Note/ }), text)
  if (externalId) {
    await user.click(within(form).getByText('Advanced: update an existing item'))
    await user.type(within(form).getByLabelText('External ID'), externalId)
  }
  await user.click(within(form).getByRole('button', { name: 'Save note' }))
}

describe('add a note', () => {
  it('saves, shows indexing progress, becomes ready, and is then findable (stale empty search is refreshed)', async () => {
    const { user, runtime } = renderApp({ route: '/?q=keypad' })
    expect(
      await screen.findByRole('heading', { name: /Nothing matched "keypad"/ }),
    ).toBeInTheDocument()

    await user.click(screen.getByRole('link', { name: 'Add content' }))
    await screen.findByRole('heading', { level: 1, name: 'Add content' })
    await pasteNote(user, {
      title: 'Garage door code',
      text: 'The garage keypad code is 4821.\n\nSpare key is under the blue pot.',
    })

    const post = await screen.findByRole('heading', { level: 3, name: 'Garage door code' })
    expect(runtime.mock?.requests).toContain('POST /v1/documents')
    const item = post.closest('li') as HTMLElement
    // Indexing finishes after the app has looked at it twice; first it is shown as in progress...
    await waitFor(() =>
      expect(within(item).getByRole('status')).toHaveTextContent(/You can find it with search/),
    )

    // ...and the earlier empty "keypad" search is not served from a stale cache.
    await user.click(screen.getByRole('link', { name: 'Search' }))
    await runSearch(user, 'keypad')
    expect(
      await screen.findByRole('heading', { level: 3, name: 'Garage door code' }),
    ).toBeInTheDocument()
  })

  it('shows the pending state while indexing is under way', async () => {
    const { user } = renderApp({ route: '/add', mock: { indexAfterPolls: 10_000 } })
    await appReady()
    await pasteNote(user, { title: 'Slow one', text: 'This takes a while.' })
    const item = (await screen.findByRole('heading', { level: 3, name: 'Slow one' })).closest(
      'li',
    ) as HTMLElement
    expect(within(item).getAllByText('Indexing').length).toBeGreaterThan(0)
    expect(within(item).getByRole('status')).toHaveTextContent(/Queued for indexing/)
    const steps = within(item).getByRole('list', { name: 'Progress' })
    expect(within(steps).getByText('Indexing')).toHaveAttribute('aria-current', 'step')
    expect(within(item).queryByRole('link', { name: 'Search for it' })).not.toBeInTheDocument()
    expect(screen.getAllByText('Note saved').length).toBeGreaterThan(0)
  })

  it('the "Search for it" link searches for the new title', async () => {
    const { user } = renderApp({ route: '/add' })
    await appReady()
    await pasteNote(user, {
      title: 'Zebra review',
      text: 'The quarterly zebra review is on Tuesday.',
    })
    await user.click(await screen.findByRole('link', { name: 'Search for it' }))
    expect(
      await screen.findByRole('heading', { level: 3, name: 'Zebra review' }),
    ).toBeInTheDocument()
  })

  it('derives the title from the first line when none is given', async () => {
    const { user } = renderApp({ route: '/add' })
    await appReady()
    await pasteNote(user, { text: '# Winter tyres\n\nBooked for December.' })
    expect(
      await screen.findByRole('heading', { level: 3, name: 'Winter tyres' }),
    ).toBeInTheDocument()
  })

  it('validates before sending anything', async () => {
    const { user, runtime } = renderApp({ route: '/add' })
    await appReady()
    await user.click(screen.getByRole('button', { name: 'Save note' }))
    expect(await screen.findByText('Write something to save.')).toBeInTheDocument()
    expect(
      within(screen.getByRole('form', { name: 'Paste a note' })).getByRole('textbox', {
        name: /^Note/,
      }),
    ).toBeInvalid()
    expect(runtime.mock?.requests.some((r) => r.startsWith('POST'))).toBe(false)
  })

  it('tells you when it is a duplicate of something already saved', async () => {
    const { user } = renderApp({ route: '/add' })
    await appReady()
    const receipt = SEED_DOCUMENTS.find((d) => d.title === 'Hardware store receipt')
    await pasteNote(user, { text: receipt?.text ?? '' })
    expect(
      await screen.findByText(/Already in your library: you added identical content/),
    ).toBeInTheDocument()
    expect(screen.getAllByText('Already in your library').length).toBeGreaterThan(0)
    const item = trackedList().querySelector('li') as HTMLElement
    expect(within(item).getByRole('heading', { level: 3 })).toHaveTextContent(
      'Hardware store receipt',
    )
  })

  it('updates in place when the same external ID is added with new text', async () => {
    const { user } = renderApp({ route: '/add' })
    await appReady()
    await pasteNote(user, { title: 'Pantry list', text: 'Rice and beans.', externalId: 'pantry-1' })
    await screen.findByRole('heading', { level: 3, name: 'Pantry list' })
    await pasteNote(user, {
      title: 'Pantry list',
      text: 'Rice, beans and lentils.',
      externalId: 'pantry-1',
    })
    expect(
      await screen.findByText(/Updated\. The earlier version stays searchable/),
    ).toBeInTheDocument()
  })

  it('reports a failed indexing run', async () => {
    const { user } = renderApp({ route: '/add' })
    await appReady()
    await pasteNote(user, { title: 'Broken', text: 'FAIL-INDEXING please' })
    const item = (await screen.findByRole('heading', { level: 3, name: 'Broken' })).closest(
      'li',
    ) as HTMLElement
    await waitFor(() =>
      expect(within(item).getByRole('status')).toHaveTextContent(/Delete it and add it again/),
    )
    expect(within(item).getAllByText('Failed').length).toBeGreaterThan(0)
    expect(within(item).queryByRole('link', { name: 'Search for it' })).not.toBeInTheDocument()
  })

  it('explains a too-large document in plain words', async () => {
    const { user } = renderApp({ route: '/add', mock: { maxBytes: 20 } })
    await appReady()
    await pasteNote(user, { text: 'This note is definitely longer than twenty bytes.' })
    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent('That is too large')
    expect(alert).toHaveTextContent(/Split it into smaller parts/)
    expect(screen.queryByRole('region', { name: 'Added this session' })).not.toBeInTheDocument()
  })
})

describe('upload a file', () => {
  const openUpload = async (user: ReturnType<typeof renderApp>['user']) => {
    await appReady()
    await user.click(screen.getByRole('tab', { name: 'Upload a file' }))
    return screen.getByRole('form', { name: 'Upload a file' })
  }

  it('uploads a markdown file as multipart, tracks it to ready and makes it findable', async () => {
    const bodies: BodyInit[] = []
    const { user } = renderApp({
      route: '/add',
      wrapFetch: (mockFetch) => (input, init) => {
        if (init?.body) bodies.push(init.body)
        return mockFetch(input, init)
      },
    })
    const form = await openUpload(user)
    const file = new File(
      ['# Meeting notes\n\nThe quarterly zebra review is on Tuesday.'],
      'meeting-notes.md',
      {
        type: 'text/markdown',
      },
    )
    await user.upload(
      within(form).getByLabelText(/^File/, { selector: 'input[type="file"]' }),
      file,
    )
    await user.click(within(form).getByRole('button', { name: 'Upload file' }))

    const heading = await screen.findByRole('heading', { level: 3, name: 'meeting-notes' })
    const sent = bodies.find((b): b is FormData => b instanceof FormData)
    expect((sent?.get('file') as File).name).toBe('meeting-notes.md')
    expect(sent?.get('sourceType')).toBe('FILE')
    expect(sent?.has('title')).toBe(false)

    const item = heading.closest('li') as HTMLElement
    await waitFor(() =>
      expect(within(item).getByRole('status')).toHaveTextContent(/You can find it with search/),
    )
    await user.click(screen.getByRole('link', { name: 'Search' }))
    await runSearch(user, 'zebra')
    expect(
      await screen.findByRole('heading', { level: 3, name: 'meeting-notes' }),
    ).toBeInTheDocument()
  })

  it('asks for a file before sending', async () => {
    const { user, runtime } = renderApp({ route: '/add' })
    const form = await openUpload(user)
    await user.click(within(form).getByRole('button', { name: 'Upload file' }))
    expect(await within(form).findByText('Choose a file to upload.')).toBeInTheDocument()
    expect(runtime.mock?.requests.some((r) => r.startsWith('POST'))).toBe(false)
  })

  it('refuses a PDF in the drop zone, says why, and sends nothing', async () => {
    const { user, runtime } = renderApp({ route: '/add', userOptions: { applyAccept: false } })
    const form = await openUpload(user)
    await user.upload(
      within(form).getByLabelText(/^File/, { selector: 'input[type="file"]' }),
      new File(['%PDF-1.7 ...'], 'statement.pdf', { type: 'application/pdf' }),
    )
    expect(
      await within(form).findByText(/statement\.pdf is not an accepted file type/),
    ).toBeVisible()
    await user.click(within(form).getByRole('button', { name: 'Upload file' }))
    expect(await within(form).findByText('Choose a file to upload.')).toBeInTheDocument()
    expect(runtime.mock?.requests.some((r) => r.startsWith('POST'))).toBe(false)
    expect(screen.queryByRole('region', { name: 'Added this session' })).not.toBeInTheDocument()
  })

  it('keeps the typed note when you switch tabs', async () => {
    const { user } = renderApp({ route: '/add' })
    await appReady()
    await user.type(screen.getByRole('textbox', { name: /^Note/ }), 'half written')
    await user.click(screen.getByRole('tab', { name: 'Upload a file' }))
    await user.click(screen.getByRole('tab', { name: 'Paste a note' }))
    expect(screen.getByRole('textbox', { name: /^Note/ })).toHaveValue('half written')
  })
})
