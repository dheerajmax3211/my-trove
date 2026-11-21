import { screen, waitFor, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { BASE, renderModule } from './test/renderModule'

const hrefs = (root: HTMLElement) =>
  Array.from(root.querySelectorAll('a[href]'), (a) => a.getAttribute('href') ?? '')

const where = () => screen.getByTestId('where').textContent

describe('mounted under the workspace base', () => {
  it('links on the dashboard and its sections all start with the base', async () => {
    for (const section of ['', '/move', '/activity', '/approvals', '/allowances', '/statement']) {
      const { container, unmount } = renderModule({ path: (id) => `/h/${id}${section}` })
      await screen.findByRole('navigation', { name: 'Household sections' })
      await screen.findByRole('heading', { level: 1 })
      // let the page's own data arrive so every link it renders exists
      await new Promise((r) => setTimeout(r, 50))
      const links = hrefs(container)
      expect(links.length).toBeGreaterThanOrEqual(8)
      for (const href of links) expect(href.startsWith(BASE), `${section}: ${href}`).toBe(true)
      unmount()
    }
  }, 30_000)

  it('the welcome page keeps its links under the base too', async () => {
    const { container } = renderModule({ path: '/welcome' })
    await screen.findByRole('heading', { level: 1, name: 'Set up your household' })
    for (const href of hrefs(container)) expect(href.startsWith(BASE)).toBe(true)
  })

  it('the module home redirects to the household, inside the base', async () => {
    const { householdId } = renderModule()
    await screen.findByRole('heading', { level: 1, name: 'Okafor family' })
    expect(where()).toBe(`${BASE}/h/${householdId}`)
  })

  it('a new person with no household lands on the welcome page, inside the base', async () => {
    renderModule({ uid: 'u-ada', seed: false })
    await screen.findByRole('heading', { level: 1, name: 'Set up your household' })
    expect(where()).toBe(`${BASE}/welcome`)
  })

  it('an unknown page says so and links back inside the base', async () => {
    renderModule({ path: '/nope' })
    const link = await screen.findByRole('link', { name: 'Go to your household' })
    expect(link).toHaveAttribute('href', BASE)
  })
})

describe('in-module household navigation', () => {
  const sectionLinks = () =>
    within(screen.getByRole('navigation', { name: 'Household sections' }))
      .getAllByRole('link')
      .map((l) => l.textContent)

  it('lists every section for an owner and marks the current one', async () => {
    renderModule()
    const nav = await screen.findByRole('navigation', { name: 'Household sections' })
    expect(sectionLinks()).toEqual([
      'Dashboard',
      'Move money',
      'Activity',
      'Approvals',
      'Statements',
      'Allowances',
      'Reconciliation',
      'Members and roles',
    ])
    expect(within(nav).getByRole('link', { name: 'Dashboard' })).toHaveAttribute(
      'aria-current',
      'page',
    )
  })

  it('shows each role only what it may open', async () => {
    renderModule({ uid: 'u-sam' })
    await screen.findByRole('navigation', { name: 'Household sections' })
    expect(sectionLinks()).toEqual([
      'Dashboard',
      'Move money',
      'Activity',
      'Approvals',
      'Statements',
      'Members and roles',
    ])
  })

  it('navigates inside the base and follows the current page', async () => {
    const { user, householdId } = renderModule()
    const nav = await screen.findByRole('navigation', { name: 'Household sections' })
    await user.click(within(nav).getByRole('link', { name: 'Approvals' }))
    await screen.findByRole('heading', { level: 1, name: 'Approvals' })
    expect(where()).toBe(`${BASE}/h/${householdId}/approvals`)
    expect(within(nav).getByRole('link', { name: 'Approvals' })).toHaveAttribute(
      'aria-current',
      'page',
    )
    expect(within(nav).getByRole('link', { name: 'Dashboard' })).not.toHaveAttribute('aria-current')
  })

  it('switching household stays inside the base', async () => {
    const { user } = renderModule()
    await screen.findByRole('heading', { level: 1, name: 'Okafor family' })
    await user.selectOptions(
      await screen.findByRole('combobox', { name: 'Household' }),
      'Lisbon trip',
    )
    await screen.findByRole('heading', { level: 1, name: 'Lisbon trip' })
    await waitFor(() => expect(where()).toMatch(new RegExp(`^${BASE}/h/`)))
  })

  it('works standalone too: with no base the paths are plain', async () => {
    renderModule({ mounted: false })
    await screen.findByRole('heading', { level: 1, name: 'Okafor family' })
    expect(where()).toMatch(/^\/h\//)
  })
})
