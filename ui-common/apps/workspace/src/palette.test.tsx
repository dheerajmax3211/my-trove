import { screen, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { recentKey } from './shell/CommandPaletteHost'
import { fakeAdmin, fakeModule, renderDemo } from './testing/harness'

const modules = () => [fakeModule('alpha'), fakeModule('beta'), fakeAdmin()]
const OPEN = '{Control>}k{/Control}'

async function openPalette(user: ReturnType<typeof renderDemo>['user']) {
  await screen.findByRole('navigation', { name: 'Workspace' })
  await user.keyboard(OPEN)
  return screen.findByRole('dialog', { name: 'Search the workspace' })
}

const optionLabels = (dialog: HTMLElement) =>
  within(dialog)
    .getAllByRole('option')
    .map((option) => option.textContent ?? '')

describe('command palette', () => {
  it('opens with the hotkey and from the search button, and closes with Escape', async () => {
    const { user } = renderDemo('OWNER', { modules: modules() })
    await openPalette(user)
    await user.keyboard('{Escape}')
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Search the workspace' }))
    expect(await screen.findByRole('dialog', { name: 'Search the workspace' })).toBeInTheDocument()
  })

  it('finds a module page by typing and goes there on Enter', async () => {
    const { user } = renderDemo('MEMBER', { modules: modules() })
    const dialog = await openPalette(user)
    await user.keyboard('beta det')
    expect(optionLabels(dialog)[0]).toContain('Beta detail')
    await user.keyboard('{Enter}')
    expect(await screen.findByRole('heading', { name: 'Beta detail page' })).toBeInTheDocument()
    expect(window.location.pathname).toBe('/app/beta/detail')
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('lists workspace pages and actions', async () => {
    const { user } = renderDemo('MEMBER', { modules: modules() })
    const dialog = await openPalette(user)
    const labels = optionLabels(dialog).join('|')
    for (const wanted of ['Home', 'Account', 'Reopen the welcome tour', 'Sign out']) {
      expect(labels).toContain(wanted)
    }
  })

  it('only offers pages the role may open', async () => {
    const member = renderDemo('MEMBER', { modules: modules() })
    let dialog = await openPalette(member.user)
    let labels = optionLabels(dialog).join('|')
    expect(labels).toContain('Alpha detail')
    expect(labels).not.toContain('Alpha secret') // needs flags:manage
    expect(labels).not.toContain('Users') // admin console
    member.unmount()

    const owner = renderDemo('OWNER', { modules: modules() })
    dialog = await openPalette(owner.user)
    labels = optionLabels(dialog).join('|')
    expect(labels).toContain('Alpha secret')
    expect(labels).toContain('Users')
    owner.unmount()

    const auditor = renderDemo('AUDITOR', { modules: modules() })
    dialog = await openPalette(auditor.user)
    labels = optionLabels(dialog).join('|')
    expect(labels).not.toContain('Alpha')
    expect(labels).toContain('Users')
  })

  it('offers the demo personas only in demo mode, and switching one takes effect', async () => {
    const { user } = renderDemo('OWNER', { modules: modules() })
    const dialog = await openPalette(user)
    await user.click(within(dialog).getByRole('option', { name: /View as Member/ }))
    const nav = screen.getByRole('navigation', { name: 'Workspace' })
    await within(nav).findByRole('link', { name: 'Alpha' })
    expect(within(nav).queryByRole('link', { name: 'Admin' })).not.toBeInTheDocument()
  })

  it('can sign out', async () => {
    const { user } = renderDemo('MEMBER', { modules: modules() })
    const dialog = await openPalette(user)
    await user.click(within(dialog).getByRole('option', { name: /Sign out/ }))
    expect(await screen.findByRole('button', { name: 'Continue with Google' })).toBeInTheDocument()
  })

  it('remembers what you opened and lists it first under Recent', async () => {
    const { user, storage } = renderDemo('MEMBER', { modules: modules() })
    let dialog = await openPalette(user)
    await user.click(within(dialog).getByRole('option', { name: /Beta detail/ }))
    await screen.findByRole('heading', { name: 'Beta detail page' })
    expect(JSON.parse(storage.local?.getItem(recentKey('demo-user')) ?? '[]')).toEqual([
      'nav:beta:/detail',
    ])

    await user.keyboard(OPEN)
    dialog = await screen.findByRole('dialog', { name: 'Search the workspace' })
    expect(optionLabels(dialog)[0]).toContain('Beta detail')
    expect(within(dialog).getByText('Recent')).toBeInTheDocument()
    // listed once, not again under its product
    expect(optionLabels(dialog).filter((label) => label.includes('Beta detail'))).toHaveLength(1)
    // and still found by its product name
    await user.keyboard('beta')
    expect(optionLabels(dialog).join('|')).toContain('Beta detail')
  })

  it('says when nothing matches', async () => {
    const { user } = renderDemo('MEMBER', { modules: modules() })
    const dialog = await openPalette(user)
    await user.keyboard('zzzzzz')
    expect(within(dialog).getAllByText(/Nothing matches/).length).toBeGreaterThan(0)
    expect(within(dialog).queryAllByRole('option')).toHaveLength(0)
  })
})
