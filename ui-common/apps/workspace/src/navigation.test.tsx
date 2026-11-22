import type { Persona } from '@platform/ui'
import { screen, waitFor, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { fakeAdmin, fakeModule, renderDemo } from './testing/harness'

const modules = () => [fakeModule('alpha'), fakeModule('beta'), fakeAdmin()]

async function sidebarLinks(): Promise<string[]> {
  const nav = await screen.findByRole('navigation', { name: 'Workspace' })
  return within(nav)
    .getAllByRole('link')
    .map((link) => link.textContent ?? '')
}

describe('persona navigation matrix', () => {
  const matrix: [Persona, string[]][] = [
    ['MEMBER', ['Home', 'Alpha', 'Beta', 'Account']],
    ['DEVELOPER', ['Home', 'Alpha', 'Beta', 'Developer', 'Account']],
    ['ADMIN', ['Home', 'Alpha', 'Beta', 'Admin', 'Account']],
    ['OWNER', ['Home', 'Alpha', 'Beta', 'Admin', 'Developer', 'Account']],
    // An auditor has no products:use, so no products, but may read users and usage.
    ['AUDITOR', ['Home', 'Admin', 'Account']],
  ]

  it.each(matrix)('%s sees the right sidebar', async (persona, expected) => {
    renderDemo(persona, { modules: modules() })
    expect(await sidebarLinks()).toEqual(expected)
  })

  it.each(matrix)('%s sees their own role badge in the top bar', async (persona) => {
    renderDemo(persona, { modules: modules() })
    await sidebarLinks()
    const badge = document.querySelector('header [data-persona]')
    expect(badge?.getAttribute('data-persona')).toBe(persona)
  })

  it('lists a module page only when the role holds its permission', async () => {
    const member = renderDemo('MEMBER', { modules: modules(), path: '/app/alpha' })
    const memberNav = await screen.findByTestId('module-nav')
    expect(
      within(memberNav)
        .getAllByRole('link')
        .map((l) => l.textContent),
    ).toEqual(['Alpha home', 'Alpha detail'])
    member.unmount()

    renderDemo('ADMIN', { modules: modules(), path: '/app/alpha' })
    const adminNav = await screen.findByTestId('module-nav')
    expect(
      within(adminNav)
        .getAllByRole('link')
        .map((l) => l.textContent),
    ).toEqual(['Alpha home', 'Alpha detail', 'Alpha secret'])
  })

  it('shows the admin pages an auditor may read and hides the ones they may not', async () => {
    renderDemo('AUDITOR', { modules: modules(), path: '/app/admin' })
    const nav = await screen.findByTestId('module-nav')
    expect(
      within(nav)
        .getAllByRole('link')
        .map((l) => l.textContent),
    ).toEqual(['Overview', 'Users'])
    expect(screen.getByRole('heading', { name: 'ADMIN CONSOLE CONTENT' })).toBeInTheDocument()
  })

  it('puts pinned products first in the sidebar', async () => {
    renderDemo('MEMBER', { modules: modules(), onboarded: ['beta'] })
    expect(await sidebarLinks()).toEqual(['Home', 'Beta', 'Alpha', 'Account'])
  })
})

describe('route gating', () => {
  it('shows a clear forbidden page, never admin UI, when a MEMBER types /app/admin/users', async () => {
    renderDemo('MEMBER', { modules: modules(), path: '/app/admin/users' })
    const forbidden = await screen.findByTestId('forbidden')
    expect(within(forbidden).getByRole('heading', { level: 1 })).toHaveTextContent(
      'Admin is not part of your role',
    )
    // what is missing, and who you are
    expect(within(forbidden).getByText('users:read')).toBeInTheDocument()
    expect(within(forbidden).getByText('usage:read:all')).toBeInTheDocument()
    expect(within(forbidden).getByText('Member')).toBeInTheDocument()
    // never half of the module, never a spinner left spinning
    expect(screen.queryByText('ADMIN CONSOLE CONTENT')).not.toBeInTheDocument()
    expect(screen.queryByRole('status')).not.toBeInTheDocument()
    expect(within(forbidden).getByRole('link', { name: 'Back to Today' })).toHaveAttribute(
      'href',
      '/',
    )
  })

  it('applies the same gate to a DEVELOPER', async () => {
    renderDemo('DEVELOPER', { modules: modules(), path: '/app/admin' })
    expect(await screen.findByTestId('forbidden')).toBeInTheDocument()
    expect(screen.queryByText('ADMIN CONSOLE CONTENT')).not.toBeInTheDocument()
  })

  it('lets an ADMIN into the admin console', async () => {
    renderDemo('ADMIN', { modules: modules(), path: '/app/admin/users' })
    expect(
      await screen.findByRole('heading', { name: 'ADMIN CONSOLE CONTENT' }),
    ).toBeInTheDocument()
    expect(screen.queryByTestId('forbidden')).not.toBeInTheDocument()
  })

  it('blocks a product for an AUDITOR, who has no products:use', async () => {
    renderDemo('AUDITOR', { modules: modules(), path: '/app/alpha' })
    const forbidden = await screen.findByTestId('forbidden')
    expect(within(forbidden).getByText('products:use')).toBeInTheDocument()
    expect(screen.queryByText('Alpha home')).not.toBeInTheDocument()
  })

  it('honours a module requiredPermission', async () => {
    const strict = fakeModule('strict', { requiredPermission: 'flags:manage' })
    const member = renderDemo('MEMBER', { modules: [strict], path: '/app/strict' })
    expect(await screen.findByTestId('forbidden')).toBeInTheDocument()
    expect(screen.getByText('flags:manage')).toBeInTheDocument()
    member.unmount()
    renderDemo('ADMIN', { modules: [strict], path: '/app/strict' })
    expect(await screen.findByRole('heading', { name: 'Strict home' })).toBeInTheDocument()
  })

  it('answers an unknown product id with a 404 page that lists your products', async () => {
    renderDemo('MEMBER', { modules: modules(), path: '/app/nope' })
    const notFound = await screen.findByTestId('not-found')
    expect(within(notFound).getByRole('heading', { level: 1 })).toHaveTextContent('no product')
    expect(within(notFound).getByRole('link', { name: 'Alpha' })).toHaveAttribute(
      'href',
      '/app/alpha',
    )
  })

  it('answers an unknown workspace path with a 404 page', async () => {
    renderDemo('MEMBER', { modules: modules(), path: '/nothing/here' })
    expect(await screen.findByTestId('not-found')).toBeInTheDocument()
  })
})

describe('module without pages', () => {
  it('shows the development fallback instead of a blank page', async () => {
    const stub = fakeModule('stubby', { Routes: () => null })
    renderDemo('MEMBER', { modules: [stub], path: '/app/stubby' })
    const fallback = await screen.findByTestId('module-fallback')
    expect(within(fallback).getByText('Stubby has no pages yet')).toBeInTheDocument()
    expect(within(fallback).getByText('/app/stubby')).toBeInTheDocument()
    expect(within(fallback).getByText('http://localhost:8080/api/stubby')).toBeInTheDocument()
  })

  it('does not show the fallback for a module that draws something', async () => {
    renderDemo('MEMBER', { modules: [fakeModule('alpha')], path: '/app/alpha' })
    await screen.findByRole('heading', { name: 'Alpha home' })
    await waitFor(() => expect(screen.queryByTestId('module-fallback')).not.toBeInTheDocument())
  })
})
