import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { AppShell, SidebarLink, SidebarNav, SidebarSection } from './AppShell'

function Shell(props: Partial<Parameters<typeof AppShell>[0]> = {}) {
  return (
    <AppShell
      brand="Platform"
      topbar={<span>topbar content</span>}
      sidebar={
        <SidebarNav label="Main">
          <SidebarSection title="Workspace">
            <SidebarLink href="#/inbox" active>
              Inbox
            </SidebarLink>
            <SidebarLink href="#/settings">Settings</SidebarLink>
          </SidebarSection>
        </SidebarNav>
      }
      {...props}
    >
      <h1>Page</h1>
    </AppShell>
  )
}

describe('AppShell', () => {
  it('provides banner, navigation and main landmarks and a skip link to main', () => {
    render(<Shell />)
    expect(screen.getByRole('banner')).toHaveTextContent('topbar content')
    expect(screen.getByRole('navigation', { name: 'Main' })).toBeInTheDocument()
    const main = screen.getByRole('main')
    expect(main).toContainElement(screen.getByRole('heading', { name: 'Page' }))
    const skip = screen.getByRole('link', { name: 'Skip to main content' })
    expect(skip).toHaveAttribute('href', `#${main.id}`)
  })

  it('marks the active link with aria-current=page', () => {
    render(<Shell />)
    expect(screen.getByRole('link', { name: 'Inbox' })).toHaveAttribute('aria-current', 'page')
    expect(screen.getByRole('link', { name: 'Settings' })).not.toHaveAttribute('aria-current')
  })

  it('opens a modal navigation drawer from the menu button and closes it with Escape, restoring focus', async () => {
    render(<Shell />)
    const menu = screen.getByRole('button', { name: 'Open navigation menu' })
    await userEvent.click(menu)
    const drawer = await screen.findByRole('dialog', { name: 'Navigation' })
    expect(within(drawer).getByRole('link', { name: 'Settings' })).toBeInTheDocument()
    await userEvent.keyboard('{Escape}')
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    expect(menu).toHaveFocus()
  })

  it('closes the drawer after choosing a nav link', async () => {
    render(<Shell />)
    await userEvent.click(screen.getByRole('button', { name: 'Open navigation menu' }))
    const drawer = await screen.findByRole('dialog')
    await userEvent.click(within(drawer).getByRole('link', { name: 'Settings' }))
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
  })

  it('closes from its own close button and supports controlled mode', async () => {
    const onDrawerOpenChange = vi.fn()
    render(<Shell drawerOpen onDrawerOpenChange={onDrawerOpenChange} />)
    await userEvent.click(await screen.findByRole('button', { name: 'Close navigation menu' }))
    expect(onDrawerOpenChange).toHaveBeenCalledWith(false)
  })

  it('closes the drawer when the viewport grows to desktop width', async () => {
    let listener: ((e: MediaQueryListEvent) => void) | undefined
    const original = window.matchMedia
    window.matchMedia = ((query: string) => ({
      matches: false,
      media: query,
      addEventListener: (_: string, cb: (e: MediaQueryListEvent) => void) => (listener = cb),
      removeEventListener: () => {},
    })) as unknown as typeof window.matchMedia
    try {
      render(<Shell />)
      await userEvent.click(screen.getByRole('button', { name: 'Open navigation menu' }))
      await screen.findByRole('dialog')
      listener?.({ matches: true } as MediaQueryListEvent)
      await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    } finally {
      window.matchMedia = original
    }
  })

  it('SidebarLink supports asChild for router links', () => {
    render(
      <ul>
        <SidebarLink asChild active>
          <a href="/x">Routed</a>
        </SidebarLink>
      </ul>,
    )
    expect(screen.getByRole('link', { name: 'Routed' })).toHaveAttribute('aria-current', 'page')
  })
})
