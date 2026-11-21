import { screen, within } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import {
  createTestAuth,
  fakeModule,
  mountApp,
  createLiveRuntime,
  renderDemo,
  renderLive,
} from './testing/harness'
import { onboardingKey } from './onboarding/OnboardingProvider'
import { createRuntime } from './runtime'
import { memoryStorages } from './testing/harness'

const modules = () => [fakeModule('alpha'), fakeModule('beta')]

describe('account page', () => {
  it('shows profile, role, grouped permissions, plan and a labelled placeholder for connected apps', async () => {
    renderLive({ persona: 'ADMIN', modules: modules(), path: '/account' })
    expect(await screen.findByRole('heading', { level: 1, name: 'Account' })).toBeInTheDocument()

    const profile = screen.getByRole('region', { name: 'Profile' })
    expect(within(profile).getByText('Ada Lovelace')).toBeInTheDocument()
    expect(within(profile).getByText('a@example.test')).toBeInTheDocument()

    const roles = screen.getByRole('region', { name: 'Role and permissions' })
    expect(within(roles).getByText('Admin')).toBeInTheDocument()
    const running = within(roles).getByRole('region', { name: 'Running the platform' })
    expect(within(running).getByText('users:write')).toBeInTheDocument()
    expect(within(running).queryByText('plans:manage')).not.toBeInTheDocument() // an admin cannot change plans
    expect(within(roles).queryByRole('region', { name: 'Developer tools' })).not.toBeInTheDocument()

    const plan = screen.getByRole('region', { name: 'Plan' })
    expect(within(plan).getByText('Pro')).toBeInTheDocument()
    expect(within(plan).getByText(/600 requests a minute and 200,000 a month/)).toBeInTheDocument()

    const apps = screen.getByRole('region', { name: 'Connected apps' })
    expect(within(apps).getByText('Coming with the developer portal')).toBeInTheDocument()
  })

  it('switches the theme', async () => {
    const { user } = renderLive({ modules: modules(), path: '/account' })
    await user.click(await screen.findByRole('button', { name: 'Dark' }))
    expect(document.documentElement).toHaveAttribute('data-theme', 'dark')
    expect(screen.getByRole('button', { name: 'Dark' })).toHaveAttribute('aria-pressed', 'true')
    await user.click(screen.getByRole('button', { name: 'System' }))
    expect(document.documentElement).not.toHaveAttribute('data-theme')
  })

  it('signs out', async () => {
    const { user } = renderLive({ modules: modules(), path: '/account' })
    await user.click(await screen.findByRole('button', { name: 'Sign out' }))
    expect(await screen.findByRole('button', { name: 'Continue with Google' })).toBeInTheDocument()
  })

  it('works for the demo persona too', async () => {
    renderDemo('OWNER', { modules: modules(), path: '/account' })
    const roles = await screen.findByRole('region', { name: 'Role and permissions' })
    expect(within(roles).getByText('plans:manage')).toBeInTheDocument()
    expect(within(roles).getByText('roles:assign:privileged')).toBeInTheDocument()
  })
})

describe('sign-in page', () => {
  function signedOut() {
    const auth = createTestAuth(null)
    const storage = memoryStorages()
    storage.local?.setItem(onboardingKey('me-1'), JSON.stringify({ status: 'done', pinned: [] }))
    const live = createLiveRuntime({ auth, storage })
    const view = mountApp(live.runtime, modules(), '/')
    return { ...live, ...view }
  }

  it('says what My-Trove is, lists the products, and offers every way in', async () => {
    signedOut()
    expect(
      await screen.findByRole('heading', {
        level: 1,
        name: /Keep your household.s life data in one private place/,
      }),
    ).toBeInTheDocument()
    expect(screen.getByText(/you decide who can see each part/)).toBeInTheDocument()
    const inside = screen.getByRole('list', { name: 'What is inside' })
    expect(within(inside).getAllByRole('listitem')).toHaveLength(2)
    expect(screen.getByRole('button', { name: 'Continue with Google' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Email me a sign-in link' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Try the demo' })).toHaveAttribute('href', '/?demo=1')
    expect(screen.getByRole('link', { name: /Read what My-Trove is on our site/ })).toHaveAttribute(
      'href',
      'http://localhost:5191',
    )
  })

  it('links to the site given in the environment', async () => {
    const auth = createTestAuth(null)
    const runtime = createRuntime(
      { VITE_DEV_IDP_URL: 'http://idp.test', VITE_SITE_URL: 'https://mytrove.example/' },
      { search: '', storage: memoryStorages(), authClient: auth },
    )
    mountApp(runtime, modules(), '/')
    expect(await screen.findByRole('link', { name: /Read what My-Trove is/ })).toHaveAttribute(
      'href',
      'https://mytrove.example',
    )
  })

  it('signs in with Google and lands in the workspace at the same URL', async () => {
    const { user } = signedOut()
    await user.click(await screen.findByRole('button', { name: 'Continue with Google' }))
    expect(await screen.findByRole('navigation', { name: 'Workspace' })).toBeInTheDocument()
  })

  it('sends an email link and tells the person to check their inbox', async () => {
    const { user, auth } = signedOut()
    const send = vi.spyOn(auth, 'sendEmailLink')
    await user.type(await screen.findByLabelText('Email address'), 'me@example.test')
    await user.click(screen.getByRole('button', { name: 'Email me a sign-in link' }))
    expect(await screen.findByText('Check your inbox')).toBeInTheDocument()
    expect(send).toHaveBeenCalledWith('me@example.test', expect.anything())
  })

  it('shows what went wrong', async () => {
    const { user, auth } = signedOut()
    vi.spyOn(auth, 'signInWithGoogle').mockRejectedValue(new Error('Popup closed before finishing'))
    await user.click(await screen.findByRole('button', { name: 'Continue with Google' }))
    expect(await screen.findByText('Popup closed before finishing')).toBeInTheDocument()
    expect(screen.getByRole('alert')).toBeInTheDocument()
  })

  it('in a build with no sign-in service, says so and offers the demo user only', async () => {
    const runtime = createRuntime(
      {},
      { search: '', storage: memoryStorages(), retryQueries: false },
    )
    mountApp(runtime, modules(), '/')
    expect(await screen.findByText('Demo build')).toBeInTheDocument()
    expect(screen.queryByLabelText('Email address')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Continue with Google' })).toBeInTheDocument()
  })
})
