import { ThemeProvider } from '@platform/ui'
import { cleanup, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { App } from './App'
import { formatNumber, plans } from './content/platform'
import { productIds, products } from './content/products'
import { allPaths, isKnownPath } from './routes'

function renderAt(path: string) {
  return render(
    <ThemeProvider storageKey={null}>
      <MemoryRouter initialEntries={[path]}>
        <App />
      </MemoryRouter>
    </ThemeProvider>,
  )
}

beforeEach(() => {
  vi.spyOn(window, 'scrollTo').mockImplementation(() => {})
})

afterEach(() => {
  vi.unstubAllEnvs()
  cleanup()
})

describe('routes', () => {
  it.each(allPaths)('%s renders exactly one h1 and a document title', (path) => {
    renderAt(path)
    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1)
    expect(document.title.length).toBeGreaterThan(10)
  })

  it('gives every route a distinct document title', () => {
    const titles = new Set<string>()
    for (const path of allPaths) {
      renderAt(path)
      titles.add(document.title)
      cleanup()
    }
    expect(titles.size).toBe(allPaths.length)
  })

  it('sets a meta description per page', () => {
    renderAt('/pricing')
    const description = document.head.querySelector('meta[name="description"]')
    expect(description?.getAttribute('content')).toMatch(/billing is simulated/i)
  })

  it('renders the 404 page for an unknown path, with one h1 and noindex', () => {
    renderAt('/no/such/page')
    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1)
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(/not here/i)
    expect(document.title).toMatch(/not found/i)
    expect(document.head.querySelector('meta[name="robots"]')?.getAttribute('content')).toBe(
      'noindex',
    )
  })

  it('renders the 404 page for an unknown product id', () => {
    renderAt('/products/nope')
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(/not here/i)
  })
})

describe('links', () => {
  it('resolves every internal link on every page to a defined route', () => {
    const broken: string[] = []
    for (const path of [...allPaths, '/missing']) {
      const { container } = renderAt(path)
      for (const anchor of container.querySelectorAll<HTMLAnchorElement>('a[href]')) {
        const href = anchor.getAttribute('href') ?? ''
        if (!href.startsWith('/')) continue
        const target = href.split('#')[0]?.split('?')[0] ?? ''
        if (!isKnownPath(target === '' ? '/' : target)) broken.push(`${path} -> ${href}`)
      }
      cleanup()
    }
    expect(broken).toEqual([])
  })

  it('points hash links at ids that exist on the home page', () => {
    const { container } = renderAt('/')
    for (const id of ['products', 'how-it-works', 'plans', 'faq']) {
      expect(container.querySelector(`#${id}`)).not.toBeNull()
    }
  })
})

describe('content', () => {
  it('lists exactly the six real products', () => {
    expect(productIds).toEqual([
      'waiting-on',
      'consent',
      'home-pulse',
      'ask-your-life',
      'digital-legacy',
      'family-treasury',
    ])
    expect(products.map((p) => p.id)).toEqual([...productIds])
    expect(products.map((p) => p.name)).toEqual([
      'Waiting On',
      'Consent',
      'Home Pulse',
      'Ask Your Life',
      'Digital Legacy',
      'Family Treasury',
    ])
  })

  it('shows the six products on the home page, each linking to its page', () => {
    const { container } = renderAt('/')
    const list = container.querySelector('#products')
    expect(list).not.toBeNull()
    for (const product of products) {
      const link = within(list as HTMLElement).getByRole('link', { name: product.name })
      expect(link).toHaveAttribute('href', `/products/${product.id}`)
    }
  })

  it('gives every product page an honest "does not do yet" list', () => {
    for (const product of products) {
      expect(product.notYet.length).toBeGreaterThanOrEqual(3)
      renderAt(`/products/${product.id}`)
      expect(screen.getByRole('heading', { name: 'What it does not do yet' })).toBeInTheDocument()
      cleanup()
    }
  })

  it('keeps the plan numbers equal to the platform constraints', () => {
    expect(plans.map((p) => [p.id, p.requestsPerMinute, p.requestsPerMonth])).toEqual([
      ['FREE', 120, 10_000],
      ['PRO', 600, 200_000],
      ['DEVELOPER', 1_200, 1_000_000],
    ])
    expect(plans.map((p) => [p.apiKeys, p.webhooks])).toEqual([
      [3, 1],
      [10, 5],
      [50, 20],
    ])
  })

  it('renders those numbers on the pricing page', () => {
    renderAt('/pricing')
    for (const plan of plans) {
      expect(screen.getByTestId(`${plan.id}-minute`)).toHaveTextContent(
        formatNumber(plan.requestsPerMinute),
      )
      expect(screen.getByTestId(`${plan.id}-month`)).toHaveTextContent(
        formatNumber(plan.requestsPerMonth),
      )
      expect(screen.getByTestId(`${plan.id}-keys`)).toHaveTextContent(String(plan.apiKeys))
      expect(screen.getByTestId(`${plan.id}-webhooks`)).toHaveTextContent(String(plan.webhooks))
    }
    expect(screen.getAllByText(/billing is simulated/i).length).toBeGreaterThan(0)
  })

  it('has no placeholder text on any page', () => {
    for (const path of [...allPaths, '/missing']) {
      const { container } = renderAt(path)
      const text = container.textContent ?? ''
      expect(text).not.toMatch(/lorem|ipsum|todo|coming soon!!|tbd|placeholder/i)
      cleanup()
    }
  })

  it('shows the permission table with the persona columns', () => {
    renderAt('/platform')
    const table = screen.getByRole('table')
    expect(within(table).getAllByRole('columnheader')).toHaveLength(6)
    const ownerRow = within(table).getByRole('row', { name: /plans:manage/ })
    expect(within(ownerRow).getAllByText('Yes')).toHaveLength(1)
  })
})

describe('primary actions', () => {
  it('uses the default workspace and demo URLs', () => {
    renderAt('/')
    const workspace = screen.getAllByRole('link', { name: 'Open the workspace' })
    const demo = screen.getAllByRole('link', { name: 'Try the live demo' })
    expect(workspace.length).toBeGreaterThan(0)
    for (const link of workspace) expect(link).toHaveAttribute('href', 'http://localhost:5190')
    for (const link of demo) expect(link).toHaveAttribute('href', 'http://localhost:5190/?demo=1')
  })

  it('honours VITE_WORKSPACE_URL', () => {
    vi.stubEnv('VITE_WORKSPACE_URL', 'https://app.example.test/')
    renderAt('/products/consent')
    for (const link of screen.getAllByRole('link', { name: 'Open the workspace' })) {
      expect(link).toHaveAttribute('href', 'https://app.example.test')
    }
    for (const link of screen.getAllByRole('link', { name: 'Try the live demo' })) {
      expect(link).toHaveAttribute('href', 'https://app.example.test/?demo=1')
    }
  })

  it('honours VITE_REPO_URL', () => {
    vi.stubEnv('VITE_REPO_URL', 'https://git.example.test/me/trove')
    renderAt('/about')
    expect(screen.getByRole('link', { name: 'Read the source' })).toHaveAttribute(
      'href',
      'https://git.example.test/me/trove',
    )
  })
})

describe('the hero example', () => {
  it('lets a visitor approve, see a denial and revoke', async () => {
    const user = userEvent.setup()
    renderAt('/')
    const ticket = screen.getByRole('region', { name: 'Example access request' })
    await user.click(within(ticket).getByRole('button', { name: 'Approve' }))
    expect(within(ticket).getByText('Granted')).toBeInTheDocument()
    expect(within(ticket).getByText('Denied: SCOPE_NOT_GRANTED')).toBeInTheDocument()
    await user.click(within(ticket).getByRole('button', { name: 'Revoke access' }))
    expect(within(ticket).getByText('Denied: GRANT_REVOKED')).toBeInTheDocument()
    await user.click(within(ticket).getByRole('button', { name: 'Start again' }))
    expect(within(ticket).getByRole('button', { name: 'Approve' })).toBeInTheDocument()
  })
})

describe('keyboard', () => {
  it('makes the skip link the first stop and moves focus to the content', async () => {
    const user = userEvent.setup()
    renderAt('/')
    await user.tab()
    const skip = screen.getByRole('link', { name: 'Skip to the content' })
    expect(skip).toHaveFocus()
    expect(skip).toHaveAttribute('href', '#main')
    expect(document.getElementById('main')).not.toBeNull()
  })

  it('reaches the main navigation in order after the logo', async () => {
    const user = userEvent.setup()
    renderAt('/')
    await user.tab() // skip link
    await user.tab()
    expect(screen.getByRole('link', { name: 'My-Trove, home' })).toHaveFocus()
    await user.tab()
    expect(screen.getByRole('button', { name: /products/i })).toHaveFocus()
    for (const name of ['Platform', 'Security', 'Pricing', 'Docs']) {
      await user.tab()
      expect(
        within(screen.getByRole('navigation', { name: 'Main' })).getByRole('link', { name }),
      ).toHaveFocus()
    }
  })

  it('opens the products menu with the keyboard and closes it with Escape', async () => {
    const user = userEvent.setup()
    renderAt('/')
    const button = screen.getByRole('button', { name: /products/i })
    expect(button).toHaveAttribute('aria-expanded', 'false')
    button.focus()
    await user.keyboard('{Enter}')
    expect(button).toHaveAttribute('aria-expanded', 'true')
    const menu = document.getElementById('products-menu') as HTMLElement
    expect(within(menu).getAllByRole('link')).toHaveLength(7)
    await user.keyboard('{Escape}')
    expect(button).toHaveAttribute('aria-expanded', 'false')
    expect(button).toHaveFocus()
  })

  it('marks the current page in the navigation', () => {
    renderAt('/security')
    const nav = screen.getByRole('navigation', { name: 'Main' })
    expect(within(nav).getByRole('link', { name: 'Security' })).toHaveAttribute(
      'aria-current',
      'page',
    )
  })

  it('opens the phone menu and lists every page', async () => {
    const user = userEvent.setup()
    renderAt('/')
    await user.click(screen.getByRole('button', { name: 'Open the menu' }))
    const menu = screen.getByRole('navigation', { name: 'Menu' })
    for (const name of ['Platform', 'Security', 'Pricing', 'Docs', 'About']) {
      expect(within(menu).getByRole('link', { name })).toBeInTheDocument()
    }
    await user.keyboard('{Escape}')
    expect(screen.queryByRole('navigation', { name: 'Menu' })).toBeNull()
  })
})

describe('theme', () => {
  it('toggles the theme attribute', async () => {
    const user = userEvent.setup()
    renderAt('/')
    await user.click(screen.getByRole('button', { name: /switch to the dark theme/i }))
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark')
    await user.click(screen.getByRole('button', { name: /switch to the light theme/i }))
    expect(document.documentElement.getAttribute('data-theme')).toBe('light')
  })
})
