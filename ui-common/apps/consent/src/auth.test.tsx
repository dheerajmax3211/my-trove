import { screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { createMockBackend } from './mock/backend'
import { pageHeading, renderApp } from './test/utils'

describe('sign-in and shell', () => {
  it('asks signed-out visitors to sign in, then shows the app', async () => {
    const { user } = renderApp({ signedIn: false })
    expect(
      await screen.findByRole('heading', { level: 1, name: 'Sign in to Consent' }),
    ).toBeInTheDocument()
    expect(screen.getByText('Demo mode')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Continue as the demo user' }))
    await pageHeading('Who can see what')
    expect(screen.getByText('demo@example.test')).toBeInTheDocument()
  })

  it('signs out and clears cached data', async () => {
    const { user, runtime } = renderApp()
    await pageHeading('Who can see what')
    await user.click(screen.getByRole('button', { name: 'Sign out' }))
    expect(await screen.findByRole('heading', { name: 'Sign in to Consent' })).toBeInTheDocument()
    expect(runtime.queryClient.getQueryCache().getAll()).toHaveLength(0)
  })

  it('navigates every screen from the sidebar and moves focus to the new heading', async () => {
    const { user } = renderApp()
    await pageHeading('Who can see what')
    const nav = screen.getByRole('navigation', { name: 'Consent' })
    const screens: [string, string][] = [
      ['Requests', 'Requests'],
      ['Grants', 'Grants'],
      ['Vault', 'Vault'],
      ['Apps', 'Apps'],
      ['Access history', 'Access history'],
      ['Audit', 'Audit'],
    ]
    for (const [link, heading] of screens) {
      await user.click(
        screen
          .getAllByRole('link', { name: new RegExp(`^${link}`) })
          .find((a) => nav.contains(a)) as HTMLElement,
      )
      const h1 = await pageHeading(heading)
      expect(h1).toHaveFocus()
    }
  })

  it('shows a not-found page for unknown routes', async () => {
    renderApp({ route: '/nope' })
    expect(await screen.findByRole('heading', { name: 'Page not found' })).toBeInTheDocument()
  })

  it('sends the user back to sign-in when the gateway keeps answering 401 after a token refresh', async () => {
    const backend = createMockBackend()
    backend.failNext(/GET \/v1\/owner\/vault\/attributes/, 401, 'The ID token has expired.', 2)
    renderApp({ route: '/vault', backend })
    expect(await screen.findByRole('heading', { name: 'Sign in to Consent' })).toBeInTheDocument()
  })
})
