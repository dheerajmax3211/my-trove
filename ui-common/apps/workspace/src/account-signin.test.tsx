import { screen, within } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import {
  createTestAuth,
  fakeModule,
  mountApp,
  createLiveRuntime,
  json,
  renderDemo,
  renderLive,
} from './testing/harness'
import { onboardingKey } from './onboarding/OnboardingProvider'
import { createRuntime } from './runtime'
import { memoryStorages } from './testing/harness'

const modules = () => [fakeModule('alpha'), fakeModule('beta')]

describe('account page', () => {
  it('shows profile, role, grouped permissions, plan and the connected apps of the account', async () => {
    renderLive({
      persona: 'ADMIN',
      modules: modules(),
      path: '/account',
      handler: (url) => (url.pathname.endsWith('/consent/v1/owner/grants') ? json([]) : undefined),
    })
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
    expect(
      await within(apps).findByText('Nothing is connected to your account.'),
    ).toBeInTheDocument()
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

  it('in a build with no sign-in service, says so on the sign-in page and never signs in as demo', async () => {
    const runtime = createRuntime(
      {},
      { search: '', storage: memoryStorages(), retryQueries: false },
    )
    const { user } = mountApp(runtime, modules(), '/')
    expect(await screen.findByRole('button', { name: 'Continue with Google' })).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Continue with Google' }))
    expect(await screen.findByText(/Sign-in is not set up in this build/)).toBeInTheDocument()
    expect(screen.queryByText('Demo build')).not.toBeInTheDocument()
    expect(screen.queryByRole('navigation', { name: 'Workspace' })).not.toBeInTheDocument()
  })

  it('with the dev identity provider, Google becomes a chooser of the five seeded accounts', async () => {
    const auth = createTestAuth(null)
    const signInAs = vi.fn(() => Promise.resolve())
    Object.assign(auth, {
      dev: {
        accounts: [
          {
            email: 'dev@example.test',
            persona: 'OWNER',
            label: 'Owner',
            roles: 'Owner, Admin, Member',
            summary: 'x',
          },
          {
            email: 'member@example.test',
            persona: 'MEMBER',
            label: 'Member',
            roles: 'Member',
            summary: 'y',
          },
        ],
        signInAs,
        lastEmailLink: () => null,
      },
    })
    const storage = memoryStorages()
    storage.local?.setItem(onboardingKey('me-1'), JSON.stringify({ status: 'done', pinned: [] }))
    const live = createLiveRuntime({ auth, storage })
    const { user } = mountApp(live.runtime, modules(), '/')

    expect(await screen.findByText('Development sign-in')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Continue with Google' }))
    const chooser = screen.getByRole('region', { name: 'Choose a development account' })
    expect(
      within(chooser).getByRole('button', { name: 'Sign in as Owner, dev@example.test' }),
    ).toBeInTheDocument()
    expect(
      within(chooser).getByRole('button', { name: 'Sign in as Member, member@example.test' }),
    ).toBeInTheDocument()
    await user.click(
      within(chooser).getByRole('button', { name: 'Sign in as Member, member@example.test' }),
    )
    expect(signInAs).toHaveBeenCalledWith('member@example.test')
  })
})
