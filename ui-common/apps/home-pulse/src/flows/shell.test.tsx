import { screen, waitFor, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { isDemoMode } from '../runtime'
import { renderApp } from '../test/setup'

describe('app shell', () => {
  it('navigates between the five areas, and moves focus to the main region', async () => {
    const { user } = await renderApp()
    const nav = screen.getAllByRole('navigation', { name: 'Primary' })[0] as HTMLElement
    await user.click(within(nav).getByRole('link', { name: 'Devices' }))
    expect(await screen.findByRole('heading', { level: 1, name: 'Devices' })).toBeInTheDocument()
    expect(screen.getByRole('main')).toHaveFocus()
    expect(document.title).toBe('Devices - Home Pulse')
    await user.click(within(nav).getByRole('link', { name: 'Reminders' }))
    expect(await screen.findByRole('heading', { level: 1, name: 'Reminders' })).toBeInTheDocument()
    await user.click(within(nav).getByRole('link', { name: /^Alerts/ }))
    expect(await screen.findByRole('heading', { level: 1, name: 'Alerts' })).toBeInTheDocument()
    await user.click(within(nav).getByRole('link', { name: 'Home' }))
    expect(await screen.findByRole('heading', { level: 1, name: 'Home' })).toBeInTheDocument()
  })

  it('marks the current page and shows how many alerts are open', async () => {
    await renderApp({ path: '/alerts' })
    const nav = screen.getAllByRole('navigation', { name: 'Primary' })[0] as HTMLElement
    expect(within(nav).getByRole('link', { name: /^Alerts/ })).toHaveAttribute(
      'aria-current',
      'page',
    )
    expect(
      await within(nav).findByRole('link', { name: /^Alerts\s*2\s*open$/ }),
    ).toBeInTheDocument()
  })

  it('has a skip link and labels the demo data', async () => {
    await renderApp()
    expect(screen.getByRole('link', { name: 'Skip to main content' })).toBeInTheDocument()
    expect(screen.getByText('Demo data')).toBeInTheDocument()
  })

  it('shows a not-found page for an unknown address', async () => {
    await renderApp({ path: '/nowhere' })
    expect(await screen.findByRole('heading', { name: 'Page not found' })).toBeInTheDocument()
  })

  it('signs out to the sign-in page and back in again', async () => {
    const { user } = await renderApp()
    await user.click(screen.getByRole('button', { name: 'Sign out' }))
    expect(
      await screen.findByRole('heading', { level: 1, name: 'Sign in to Home Pulse' }),
    ).toBeInTheDocument()
    expect(screen.getByText(/Sample data only/)).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Continue with Google' }))
    expect(await screen.findByRole('heading', { level: 1, name: 'Home' })).toBeInTheDocument()
  })

  it('shows the sign-in page to someone who is not signed in', async () => {
    await renderApp({ signedIn: false })
    expect(
      await screen.findByRole('heading', { name: 'Sign in to Home Pulse' }),
    ).toBeInTheDocument()
    await waitFor(() => expect(screen.queryByRole('navigation')).not.toBeInTheDocument())
  })
})

describe('runtime mode', () => {
  it('uses demo mode when no Firebase configuration is present', () => {
    expect(isDemoMode({})).toBe(true)
    expect(isDemoMode({ VITE_API_BASE_URL: 'http://localhost:8085' })).toBe(true)
  })

  it('uses the real service once Firebase is configured, unless the mock is forced', () => {
    expect(isDemoMode({ VITE_FIREBASE_API_KEY: 'k', VITE_FIREBASE_PROJECT_ID: 'p' })).toBe(false)
    expect(isDemoMode({ VITE_FIREBASE_AUTH_EMULATOR_HOST: '127.0.0.1:9099' })).toBe(false)
    expect(
      isDemoMode({ VITE_FIREBASE_AUTH_EMULATOR_HOST: '127.0.0.1:9099', VITE_USE_MOCK: 'true' }),
    ).toBe(true)
  })
})
