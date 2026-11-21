import { screen, waitFor, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import {
  API,
  USER_A,
  USER_B,
  authHeader,
  createTestAuth,
  fakeModule,
  json,
  mountApp,
  createLiveRuntime,
  renderLive,
  type Handler,
  urlOf,
} from './testing/harness'

const modules = () => [fakeModule('alpha'), fakeModule('beta')]

/** Each service answers `/v1/items` with its own name and the caller's token, so leaks are visible. */
const itemsHandler: Handler = (url, init) => {
  const match = /\/api\/([a-z]+)\/v1\/items$/.exec(url.pathname)
  if (!match) return undefined
  return json({ name: `${match[1]} items for ${authHeader(init)}` })
}

describe('module mounting', () => {
  it('mounts a module under /app/<id>, with links and paths resolved against that base', async () => {
    const { user } = renderLive({ modules: modules(), handler: itemsHandler, path: '/app/alpha' })
    expect(await screen.findByRole('heading', { name: 'Alpha home' })).toBeInTheDocument()
    // useModulePath resolves under the base
    expect(screen.getByTestId('resolved')).toHaveTextContent('/app/alpha/detail')
    // ModuleLink resolves under the base
    const link = screen.getByRole('link', { name: 'Open Alpha detail' })
    expect(link).toHaveAttribute('href', '/app/alpha/detail')
    await user.click(link)
    expect(await screen.findByRole('heading', { name: 'Alpha detail page' })).toBeInTheDocument()
    expect(window.location.pathname).toBe('/app/alpha/detail')
  })

  it('wraps the module in its product accent', async () => {
    renderLive({ modules: modules(), handler: itemsHandler, path: '/app/beta' })
    const heading = await screen.findByRole('heading', { name: 'Beta home' })
    expect(heading.closest('[data-product]')).toHaveAttribute('data-product', 'beta')
  })

  it('puts the product accent on <body> while a module is open, for portalled dialogs', async () => {
    const first = renderLive({ modules: modules(), handler: itemsHandler, path: '/app/beta' })
    await screen.findByRole('heading', { name: 'Beta home' })
    expect(document.body.dataset.product).toBe('beta')
    first.unmount()
    expect(document.body.dataset.product).toBeUndefined()
  })

  it('supports deep links and a reload at a nested module URL', async () => {
    const first = renderLive({
      modules: modules(),
      handler: itemsHandler,
      path: '/app/beta/detail',
    })
    expect(await screen.findByRole('heading', { name: 'Beta detail page' })).toBeInTheDocument()
    first.unmount()

    // "reload": a fresh mount at the same URL with the same browser storage
    const live = createLiveRuntime({ handler: itemsHandler, storage: first.storage })
    mountApp(live.runtime, modules(), window.location.pathname)
    expect(await screen.findByRole('heading', { name: 'Beta detail page' })).toBeInTheDocument()
    expect(window.location.pathname).toBe('/app/beta/detail')
  })

  it('handles back and forward between workspace pages and module pages', async () => {
    const { user } = renderLive({ modules: modules(), handler: itemsHandler, path: '/' })
    await screen.findByRole('navigation', { name: 'Workspace' })

    await user.click(
      within(screen.getByRole('navigation', { name: 'Workspace' })).getByRole('link', {
        name: 'Alpha',
      }),
    )
    expect(await screen.findByRole('heading', { name: 'Alpha home' })).toBeInTheDocument()
    await user.click(screen.getByRole('link', { name: 'Open Alpha detail' }))
    expect(await screen.findByRole('heading', { name: 'Alpha detail page' })).toBeInTheDocument()

    window.history.back()
    expect(await screen.findByRole('heading', { name: 'Alpha home' })).toBeInTheDocument()
    expect(window.location.pathname).toBe('/app/alpha')

    window.history.back()
    await waitFor(() => expect(window.location.pathname).toBe('/'))
    expect(
      await screen.findByRole('heading', { name: /Good (morning|afternoon|evening)/ }),
    ).toBeInTheDocument()

    window.history.forward()
    expect(await screen.findByRole('heading', { name: 'Alpha home' })).toBeInTheDocument()
  })
})

describe('API client and cache isolation', () => {
  it('sends each module to its own gateway route', async () => {
    const { fetchMock, user } = renderLive({
      modules: modules(),
      handler: itemsHandler,
      path: '/app/alpha',
    })
    expect(await screen.findByText('alpha items for Bearer token-user-a')).toBeInTheDocument()
    await user.click(
      within(screen.getByRole('navigation', { name: 'Workspace' })).getByRole('link', {
        name: 'Beta',
      }),
    )
    expect(await screen.findByText('beta items for Bearer token-user-a')).toBeInTheDocument()

    const urls = fetchMock.mock.calls.map(([input]) => urlOf(input))
    expect(urls).toContain(`${API}/alpha/v1/items`)
    expect(urls).toContain(`${API}/beta/v1/items`)
    expect(urls).toContain(`${API}/auth/v1/me`)
  })

  it('never shows one product data in another, even for the same path', async () => {
    const { user } = renderLive({ modules: modules(), handler: itemsHandler, path: '/app/alpha' })
    await screen.findByText('alpha items for Bearer token-user-a')

    await user.click(
      within(screen.getByRole('navigation', { name: 'Workspace' })).getByRole('link', {
        name: 'Beta',
      }),
    )
    // Beta starts from its own empty cache: it loads, then shows its own data, never Alpha's.
    expect(screen.queryByText(/alpha items/)).not.toBeInTheDocument()
    expect(await screen.findByText('beta items for Bearer token-user-a')).toBeInTheDocument()
    expect(screen.queryByText(/alpha items/)).not.toBeInTheDocument()

    // Going back to Alpha shows Alpha's own data.
    await user.click(
      within(screen.getByRole('navigation', { name: 'Workspace' })).getByRole('link', {
        name: 'Alpha',
      }),
    )
    expect(await screen.findByText('alpha items for Bearer token-user-a')).toBeInTheDocument()
  })

  it('clears every cache on sign-out, so the next user never sees the previous one', async () => {
    const auth = createTestAuth(USER_A)
    const { fetchMock, user } = renderLive({
      modules: modules(),
      handler: itemsHandler,
      path: '/app/alpha',
      auth,
    })
    expect(await screen.findByText('alpha items for Bearer token-user-a')).toBeInTheDocument()
    const itemFetches = () =>
      fetchMock.mock.calls.filter(([input]) => urlOf(input).endsWith('/alpha/v1/items')).length
    expect(itemFetches()).toBe(1)

    // sign out through the account menu
    await user.click(screen.getByRole('button', { name: /Account menu/ }))
    await user.click(screen.getByRole('button', { name: 'Sign out' }))
    expect(await screen.findByRole('button', { name: 'Continue with Google' })).toBeInTheDocument()
    expect(screen.queryByText(/alpha items/)).not.toBeInTheDocument()

    // another person signs in on the same browser
    auth.signInAs(USER_B)
    expect(await screen.findByText('alpha items for Bearer token-user-b')).toBeInTheDocument()
    expect(screen.queryByText(/token-user-a/)).not.toBeInTheDocument()
    expect(itemFetches()).toBe(2)
  })

  it('signs the user out when the gateway rejects the session', async () => {
    const handler: Handler = (url) =>
      url.pathname.endsWith('/alpha/v1/items')
        ? new Response('{}', {
            status: 401,
            headers: { 'content-type': 'application/problem+json' },
          })
        : undefined
    renderLive({ modules: modules(), handler, path: '/app/alpha' })
    expect(await screen.findByRole('button', { name: 'Continue with Google' })).toBeInTheDocument()
  })
})
