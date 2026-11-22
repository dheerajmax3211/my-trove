import { ThemeProvider } from '@platform/ui'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { describe, expect, it } from 'vitest'
import { DemoApp } from './demo/DemoApp'
import { createDemoRuntime } from './demo/runtime'
import { ComponentPage } from './pages/ComponentPage'
import { Overview } from './pages/Overview'
import { TokensPage } from './pages/TokensPage'
import { DashboardExample } from './pages/DashboardExample'
import { FormsPage } from './pages/FormsPage'
import { MotionPage } from './pages/MotionPage'
import { SiteDemo } from './pages/SiteDemo'
import { ToastProvider } from '@platform/ui'
import { componentDocs } from './registry'

const SLOW = { timeout: 4000 }

describe('gallery pages', () => {
  it('documents every required component', () => {
    const slugs = componentDocs.map((d) => d.slug)
    for (const required of [
      'button',
      'icon-button',
      'input',
      'textarea',
      'select',
      'checkbox',
      'switch',
      'field',
      'card',
      'badge',
      'tabs',
      'dialog',
      'toast',
      'tooltip',
      'skeleton',
      'empty-state',
      'spinner',
      'data-table',
      'app-shell',
      'page-header',
      'logo',
      'product-mark',
      'section',
      'container',
      'stat',
      'sparkline',
      'avatar',
      'persona-badge',
      'stepper',
      'command-palette',
      'callout',
      'key-value-list',
      'timeline',
      'illustrations',
      'icons',
    ])
      expect(slugs).toContain(required)
  })

  it.each(componentDocs.map((d) => [d.slug, d.title] as const))(
    'renders %s in both light and dark panels',
    (slug, title) => {
      render(
        <ThemeProvider storageKey={null}>
          <MemoryRouter initialEntries={[`/components/${slug}`]}>
            <Routes>
              <Route path="components/:slug" element={<ComponentPage />} />
            </Routes>
          </MemoryRouter>
        </ThemeProvider>,
      )
      expect(screen.getByRole('heading', { level: 1, name: title })).toBeInTheDocument()
      expect(screen.getByRole('region', { name: 'light theme preview' })).toBeInTheDocument()
      expect(screen.getByRole('region', { name: 'dark theme preview' })).toBeInTheDocument()
      expect(screen.getByText('Usage')).toBeInTheDocument()
    },
  )

  it('live controls drive the preview', async () => {
    render(
      <ThemeProvider storageKey={null}>
        <MemoryRouter initialEntries={['/components/button']}>
          <Routes>
            <Route path="components/:slug" element={<ComponentPage />} />
          </Routes>
        </MemoryRouter>
      </ThemeProvider>,
    )
    const light = screen.getByRole('region', { name: 'light theme preview' })
    expect(within(light).getByRole('button', { name: 'Send reminder' })).toBeEnabled()
    await userEvent.click(screen.getByRole('switch', { name: 'disabled' }))
    expect(within(light).getByRole('button', { name: 'Send reminder' })).toBeDisabled()
    expect(
      within(screen.getByRole('region', { name: 'dark theme preview' })).getByRole('button'),
    ).toBeDisabled()
  })

  it('shows a not-found state for unknown components', () => {
    render(
      <ThemeProvider storageKey={null}>
        <MemoryRouter initialEntries={['/components/nope']}>
          <Routes>
            <Route path="components/:slug" element={<ComponentPage />} />
          </Routes>
        </MemoryRouter>
      </ThemeProvider>,
    )
    expect(screen.getByRole('heading', { name: 'Component not found' })).toBeInTheDocument()
  })

  it('overview and tokens pages render; every token contrast row passes', () => {
    render(
      <MemoryRouter>
        <Overview />
        <TokensPage />
      </MemoryRouter>,
    )
    expect(
      screen.getByRole('heading', { level: 1, name: /vault you can lend from/i }),
    ).toBeInTheDocument()
    expect(screen.queryByText(/FAIL/)).not.toBeInTheDocument()
  })
})

describe('signed-in demo (auth + api packages wired together, stub mode)', () => {
  function renderDemo() {
    const runtime = createDemoRuntime({})
    render(
      <ThemeProvider storageKey={null}>
        <MemoryRouter initialEntries={['/demo']}>
          <Routes>
            <Route path="demo/*" element={<DemoApp runtime={runtime} />} />
          </Routes>
        </MemoryRouter>
      </ThemeProvider>,
    )
    return runtime
  }

  async function signIn() {
    await userEvent.click(await screen.findByRole('button', { name: 'Continue with Google' }, SLOW))
    await screen.findByRole('heading', { level: 1, name: 'Requests' }, SLOW)
  }

  it('guards the app behind sign-in, then loads data with the bearer token and shows the shell landmarks', async () => {
    const runtime = renderDemo()
    expect(runtime.mode).toBe('stub')
    expect(
      await screen.findByRole('heading', { name: 'Sign in to the demo' }, SLOW),
    ).toBeInTheDocument()
    expect(screen.queryByRole('navigation')).not.toBeInTheDocument()

    await signIn()
    expect(await screen.findByText('Vendor W-9', undefined, SLOW)).toBeInTheDocument()
    expect(screen.getByRole('main')).toBeInTheDocument()
    expect(screen.getByRole('navigation', { name: 'Demo' })).toBeInTheDocument()
  })

  it('surfaces server-side validation (problem+json) on the right form field and then succeeds', async () => {
    renderDemo()
    await signIn()
    await userEvent.click(screen.getByRole('button', { name: /new request/i }))
    const dialog = await screen.findByRole('dialog', { name: 'New request' })
    await userEvent.click(within(dialog).getByRole('button', { name: 'Create request' }))
    expect(
      await within(dialog).findByText('Title must be at least 3 characters.', undefined, SLOW),
    ).toBeInTheDocument()
    expect(within(dialog).getByLabelText(/what are you waiting on/i)).toHaveAttribute(
      'aria-invalid',
      'true',
    )

    await userEvent.type(within(dialog).getByLabelText(/what are you waiting on/i), 'Tax receipts')
    await userEvent.type(within(dialog).getByLabelText(/who from/i), 'Sam')
    await userEvent.click(within(dialog).getByRole('button', { name: 'Create request' }))
    await waitFor(
      () => expect(screen.queryByRole('dialog', { name: 'New request' })).not.toBeInTheDocument(),
      SLOW,
    )
    expect(await screen.findByText('Tax receipts', undefined, SLOW)).toBeInTheDocument()
  })

  it('an expired token triggers exactly one forced refresh and the request still succeeds', async () => {
    const runtime = renderDemo()
    await signIn()
    await screen.findByText('Vendor W-9', undefined, SLOW)
    const before = runtime.stub?.issuedTokens() ?? 0
    await userEvent.click(screen.getByRole('button', { name: 'Expire token, then refetch' }))
    await waitFor(() => expect(runtime.stub?.issuedTokens()).toBe(before + 1), SLOW)
    expect(
      await screen.findAllByText('Token refreshed automatically', undefined, SLOW),
    ).not.toHaveLength(0)
    expect(screen.getByText('Vendor W-9')).toBeInTheDocument()
  })

  it('shows API errors normalised from problem+json', async () => {
    renderDemo()
    await signIn()
    await userEvent.click(screen.getByRole('button', { name: /trigger 500/i }))
    expect(
      (await screen.findAllByText('500 Internal error', undefined, SLOW)).length,
    ).toBeGreaterThan(0)
  })

  it('signs out back to the sign-in page', async () => {
    renderDemo()
    await signIn()
    await userEvent.click(screen.getAllByRole('button', { name: 'Sign out' })[0] as HTMLElement)
    expect(
      await screen.findByRole('heading', { name: 'Sign in to the demo' }, SLOW),
    ).toBeInTheDocument()
  })
})

describe('pattern pages', () => {
  it('the dashboard example is a full AppFrame with a bento grid of named cards', () => {
    render(
      <ThemeProvider storageKey={null}>
        <MemoryRouter>
          <DashboardExample />
        </MemoryRouter>
      </ThemeProvider>,
    )
    expect(screen.getByRole('heading', { level: 1, name: 'Household' })).toBeInTheDocument()
    for (const name of [
      'Requests in flight',
      'Where things stand',
      'Keys in use',
      'Household health',
      'Family spending',
    ])
      expect(screen.getByRole('region', { name })).toBeInTheDocument()
    expect(screen.getAllByRole('progressbar')).toHaveLength(3)
    expect(screen.getByRole('main')).toBeInTheDocument()
  })

  it('the forms page validates on blur and on submit with announced, specific errors', async () => {
    render(
      <ThemeProvider storageKey={null}>
        <ToastProvider>
          <FormsPage />
        </ToastProvider>
      </ThemeProvider>,
    )
    const form = screen.getByRole('form', { name: 'Lend a document' })
    await userEvent.type(within(form).getByRole('textbox', { name: /Full name/ }), 'S')
    await userEvent.tab()
    expect(
      await screen.findByText('Enter the name of the person you are lending to.'),
    ).toBeInTheDocument()
    await userEvent.click(within(form).getByRole('button', { name: 'Send the key' }))
    expect(screen.getAllByRole('alert').length).toBeGreaterThanOrEqual(2)
    expect(screen.getByText('Enter an email like name@example.com.')).toBeInTheDocument()
  })

  it('the motion page renders every demo section', () => {
    render(
      <ThemeProvider storageKey={null}>
        <MotionPage />
      </ThemeProvider>,
    )
    for (const name of ['Reveal and Stagger', 'Marquee', 'Animated list', 'Chart primitives'])
      expect(screen.getByRole('heading', { name })).toBeInTheDocument()
  })

  it('the cinematic site demo has a hero heading, a skip-worthy nav and numbered product cards', () => {
    // Reduced motion keeps GSAP and Lenis from loading in the test environment.
    const original = window.matchMedia
    window.matchMedia = (query: string) => ({
      matches: query.includes('prefers-reduced-motion'),
      media: query,
      onchange: null,
      addEventListener: () => {},
      removeEventListener: () => {},
      addListener: () => {},
      removeListener: () => {},
      dispatchEvent: () => false,
    })
    render(
      <ThemeProvider storageKey={null}>
        <MemoryRouter>
          <SiteDemo />
        </MemoryRouter>
      </ThemeProvider>,
    )
    expect(
      screen.getByRole('heading', { level: 1, name: 'Keep it safe. Lend it with care.' }),
    ).toBeInTheDocument()
    expect(screen.getByRole('navigation', { name: 'Primary' })).toBeInTheDocument()
    expect(screen.getAllByRole('listitem').length).toBeGreaterThanOrEqual(6)
    expect(screen.getByRole('button', { name: /Pause motion/ })).toBeInTheDocument()
    window.matchMedia = original
  })
})
