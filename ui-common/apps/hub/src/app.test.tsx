import { screen, waitFor, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { callsTo, pageHeading, problem, renderHub } from './test/renderHub'

describe('sign-in and session', () => {
  it('signs in as a demo user, makes the session call and greets them with their roles', async () => {
    const { user, requests } = renderHub({ as: null })
    await user.click(await screen.findByRole('button', { name: 'Continue as Alice Rivera' }))

    expect(await pageHeading(/Good (morning|afternoon|evening), Alice/)).toBeInTheDocument()
    expect(callsTo(requests, 'POST', '/api/auth/v1/auth/session')).toHaveLength(1)
    // Session seeds /v1/me, so no second profile request is needed.
    expect(callsTo(requests, 'GET', '/api/auth/v1/me')).toHaveLength(0)
    expect(screen.getByText('ADMIN')).toBeInTheDocument()
    expect(screen.getByText('USER')).toBeInTheDocument()
  })

  it('shows an actionable error with retry when the session call fails, then recovers', async () => {
    let failing = true
    const { user } = renderHub({
      respond: (r) => {
        if (failing && r.path.endsWith('/auth/session')) return problem(503, 'Auth is warming up')
        return undefined
      },
    })
    expect(await screen.findByRole('alert')).toHaveTextContent('Auth is warming up')
    failing = false
    await user.click(screen.getByRole('button', { name: 'Try again' }))
    expect(await pageHeading(/Good (morning|afternoon|evening), Alice/)).toBeInTheDocument()
  })

  it('signs out from the account page and returns to the sign-in screen', async () => {
    const { user } = renderHub({ route: '/account' })
    await pageHeading('Account')
    await user.click(within(screen.getByRole('main')).getByRole('button', { name: 'Sign out' }))
    expect(
      await screen.findByRole('heading', { name: /Sign in to the demo hub/ }),
    ).toBeInTheDocument()
  })
})

describe('launcher home', () => {
  it('links every product app, from env or the localhost defaults', async () => {
    renderHub({ env: { VITE_APP_URL_HOME_PULSE: 'https://pulse.example.com' } })
    await pageHeading(/Good/)
    const launcher = screen.getByRole('region', { name: 'Your apps' })
    const hrefs = Object.fromEntries(
      within(launcher)
        .getAllByRole('link')
        .map((a) => [a.textContent, a.getAttribute('href')]),
    )
    expect(hrefs).toEqual({
      'Waiting On': 'http://localhost:5182',
      Consent: 'http://localhost:5183',
      'Home Pulse': 'https://pulse.example.com',
      'Ask Your Life': 'http://localhost:5185',
      'Digital Legacy': 'http://localhost:5186',
      'Family Treasury': 'http://localhost:5187',
    })
  })

  it('explains households to a new user and offers both ways in', async () => {
    renderHub()
    expect(
      await screen.findByRole('heading', {
        name: 'Share the small stuff with the people you live with',
      }),
    ).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Create a household' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Join with a code' })).toBeInTheDocument()
    expect(
      screen.getByRole('heading', { name: 'A household is the people you share with' }),
    ).toBeInTheDocument()
  })

  it('summarises the household, what is coming up and what happened lately for the seeded demo account', async () => {
    renderHub({ seed: 'demo' })
    expect(await screen.findByRole('heading', { name: 'Rivera household' })).toBeInTheDocument()
    const upcoming = (await screen.findByRole('heading', { name: 'Coming up' })).closest('section')!
    expect(await within(upcoming).findByText('Water the plants')).toBeInTheDocument()
    expect(within(upcoming).getByText('Renew passport')).toBeInTheDocument()
    expect(within(upcoming).queryByText('Book dentist')).not.toBeInTheDocument()
    const lately = screen
      .getByRole('heading', { name: /Lately in Rivera household/ })
      .closest('section')!
    expect(await within(lately).findByText('You created the household')).toBeInTheDocument()
    expect(within(lately).getByText('Bob Rivera joined the household')).toBeInTheDocument()
  })

  it('shows a retryable error when the households fail to load', async () => {
    let failing = true
    const { user } = renderHub({
      respond: (r) =>
        failing && r.path.endsWith('/shared/v1/households')
          ? problem(500, 'Database is down')
          : undefined,
    })
    expect(await screen.findByText('Database is down')).toBeInTheDocument()
    failing = false
    await user.click(screen.getAllByRole('button', { name: 'Try again' })[0]!)
    expect(
      await screen.findByRole('heading', {
        name: 'Share the small stuff with the people you live with',
      }),
    ).toBeInTheDocument()
  })
})

describe('admin gating', () => {
  it('hides the Admin link from non-admins and blocks the route', async () => {
    renderHub({ as: 'demo-bob', route: '/admin' })
    expect(await screen.findByRole('heading', { name: 'Administrators only' })).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: 'Admin' })).not.toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'Users and roles' })).not.toBeInTheDocument()
  })

  it('shows the Admin link and page to administrators', async () => {
    const { user } = renderHub()
    await user.click(await screen.findByRole('link', { name: 'Admin' }))
    expect(await pageHeading('Users and roles')).toBeInTheDocument()
  })
})

describe('account', () => {
  it('shows the profile from auth-service and switches the theme', async () => {
    const { user } = renderHub({ route: '/account' })
    await pageHeading('Account')
    expect(await screen.findByText('alice@example.test', { selector: 'p' })).toBeInTheDocument()
    expect(screen.getByText('0198a1ce-0000-7000-8000-000000000001')).toBeInTheDocument()

    const theme = screen.getAllByRole('combobox', { name: 'Theme' })[0]!
    await user.selectOptions(theme, 'dark')
    await waitFor(() => expect(document.documentElement).toHaveAttribute('data-theme', 'dark'))
    await user.selectOptions(theme, 'system')
  })

  it('refreshes the profile on demand', async () => {
    const { user, requests } = renderHub({ route: '/account' })
    await pageHeading('Account')
    await user.click(screen.getByRole('button', { name: 'Refresh profile' }))
    await waitFor(() => expect(callsTo(requests, 'GET', '/api/auth/v1/me')).toHaveLength(1))
  })

  it('keeps one user data out of another: switching user starts from a clean cache', async () => {
    const { user } = renderHub({ route: '/households' })
    await user.click((await screen.findAllByRole('button', { name: 'Create household' }))[0]!)
    await user.type(screen.getByRole('textbox', { name: /Household name/ }), 'Alice only')
    await user.click(
      within(screen.getByRole('dialog')).getByRole('button', { name: 'Create household' }),
    )
    await pageHeading('Alice only')

    await user.selectOptions(screen.getByRole('combobox', { name: 'Switch demo user' }), 'demo-bob')
    // Bob lands on the detail route he cannot see: 404, not Alice's cached household.
    expect(await screen.findByText(/could not find that|Household not found/i)).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'Alice only' })).not.toBeInTheDocument()
  })
})

describe('routing', () => {
  it('shows a not-found page for unknown routes', async () => {
    renderHub({ route: '/nope' })
    expect(await screen.findByRole('heading', { name: 'Page not found' })).toBeInTheDocument()
  })
})
