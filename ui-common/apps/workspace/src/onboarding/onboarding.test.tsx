import { screen, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { createRuntime } from '../runtime'
import {
  createLiveRuntime,
  createTestAuth,
  fakeModule,
  memoryStorages,
  meFor,
  mountApp,
  renderDemo,
  USER_A,
} from '../testing/harness'
import { onboardingKey } from './OnboardingProvider'

// Beta is listed before Alpha so that pinning Alpha visibly changes the sidebar order.
const modules = () => [fakeModule('beta'), fakeModule('alpha'), fakeModule('gamma')]
const stored = (storage: ReturnType<typeof memoryStorages>) =>
  JSON.parse(storage.local?.getItem(onboardingKey('demo-user')) ?? 'null') as unknown

describe('first-run onboarding', () => {
  it('opens on first sign-in with a welcome that says what My-Trove is', async () => {
    renderDemo('MEMBER', { modules: modules(), onboarded: false })
    expect(
      await screen.findByRole('heading', { level: 1, name: 'Welcome to My-Trove' }),
    ).toBeInTheDocument()
    expect(
      screen.getByText(/one private workspace for the paperwork and promises of a household/),
    ).toBeInTheDocument()
    expect(screen.getByRole('list', { name: 'Getting started' })).toBeInTheDocument()
    expect(screen.queryByRole('navigation', { name: 'Workspace' })).not.toBeInTheDocument()
  })

  it('walks welcome, pick products and one first action per pinned product, then saves the choice', async () => {
    const { user, storage } = renderDemo('MEMBER', { modules: modules(), onboarded: false })
    await user.click(await screen.findByRole('button', { name: 'Choose your products' }))

    expect(
      screen.getByRole('heading', { level: 1, name: 'Which products will you use first?' }),
    ).toBeInTheDocument()
    await user.click(screen.getByRole('checkbox', { name: /Alpha/ }))
    await user.click(screen.getByRole('checkbox', { name: /Gamma/ }))
    await user.click(screen.getByRole('button', { name: 'Continue' }))

    expect(
      screen.getByRole('heading', { level: 1, name: 'Start with one small thing' }),
    ).toBeInTheDocument()
    const steps = screen
      .getAllByRole('listitem')
      .filter((li) => within(li).queryByRole('button', { name: /Start|Open/ }))
    expect(steps).toHaveLength(2) // one first step per pinned product
    expect(screen.getByText(/Alpha\./)).toBeInTheDocument()
    expect(screen.queryByText(/Beta\./)).not.toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Open Today' }))
    expect(await screen.findByRole('navigation', { name: 'Workspace' })).toBeInTheDocument()
    expect(stored(storage)).toEqual({ status: 'done', pinned: ['alpha', 'gamma'] })

    // pinned products come first in the sidebar, then the rest in registry order
    const nav = screen.getByRole('navigation', { name: 'Workspace' })
    expect(
      within(nav)
        .getAllByRole('link')
        .map((l) => l.textContent),
    ).toEqual(['Home', 'Alpha', 'Gamma', 'Beta', 'Account'])
  })

  it('a first step opens that product', async () => {
    const { user } = renderDemo('MEMBER', { modules: [fakeModule('alpha')], onboarded: false })
    await user.click(await screen.findByRole('button', { name: 'Choose your products' }))
    await user.click(screen.getByRole('checkbox', { name: /Alpha/ }))
    await user.click(screen.getByRole('button', { name: 'Continue' }))
    await user.click(screen.getByRole('button', { name: /in Alpha/ }))
    expect(await screen.findByRole('heading', { name: 'Alpha home' })).toBeInTheDocument()
    expect(window.location.pathname).toBe('/app/alpha')
  })

  it('can be skipped, and then stays closed', async () => {
    const { user, storage, unmount } = renderDemo('MEMBER', {
      modules: modules(),
      onboarded: false,
    })
    await user.click(await screen.findByRole('button', { name: 'Skip for now' }))
    expect(await screen.findByRole('navigation', { name: 'Workspace' })).toBeInTheDocument()
    expect(stored(storage)).toEqual({ status: 'skipped', pinned: [] })
    unmount()

    // a later visit with the same browser storage goes straight to the workspace
    const runtime = createRuntime({}, { search: '?demo=1', storage, retryQueries: false })
    mountApp(runtime, modules(), '/')
    expect(await screen.findByRole('navigation', { name: 'Workspace' })).toBeInTheDocument()
    expect(screen.queryByText('Welcome to My-Trove')).not.toBeInTheDocument()
  })

  it('remembers pinned products across a reload', async () => {
    const first = renderDemo('MEMBER', { modules: modules(), onboarded: false })
    await first.user.click(await screen.findByRole('button', { name: 'Choose your products' }))
    await first.user.click(screen.getByRole('checkbox', { name: /Alpha/ }))
    await first.user.click(screen.getByRole('button', { name: 'Continue' }))
    await first.user.click(screen.getByRole('button', { name: 'Open Today' }))
    await screen.findByRole('navigation', { name: 'Workspace' })
    first.unmount()

    const runtime = createRuntime(
      {},
      { search: '?demo=1', storage: first.storage, retryQueries: false },
    )
    mountApp(runtime, modules(), '/')
    const nav = await screen.findByRole('navigation', { name: 'Workspace' })
    expect(
      within(nav)
        .getAllByRole('link')
        .map((l) => l.textContent),
    ).toEqual(['Home', 'Alpha', 'Beta', 'Gamma', 'Account'])
  })

  it('is stored per user: another person on the same browser sees the wizard', async () => {
    const storage = memoryStorages()
    storage.local?.setItem(onboardingKey('me-1'), JSON.stringify({ status: 'done', pinned: [] }))

    const first = createLiveRuntime({ storage, auth: createTestAuth(USER_A) })
    const one = mountApp(first.runtime, modules(), '/')
    expect(await screen.findByRole('navigation', { name: 'Workspace' })).toBeInTheDocument()
    one.unmount()

    const second = createLiveRuntime({
      storage,
      auth: createTestAuth(USER_A),
      me: () => meFor('MEMBER', { id: 'me-2' }),
    })
    mountApp(second.runtime, modules(), '/')
    expect(
      await screen.findByRole('heading', { level: 1, name: 'Welcome to My-Trove' }),
    ).toBeInTheDocument()
  })

  it('can be re-opened from Account with the pinned products ticked', async () => {
    const { user } = renderDemo('MEMBER', {
      modules: modules(),
      onboarded: ['alpha'],
      path: '/account',
    })
    await user.click(await screen.findByRole('button', { name: 'Open the welcome tour' }))
    expect(
      await screen.findByRole('heading', { level: 1, name: 'Welcome to My-Trove' }),
    ).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Choose your products' }))
    expect(screen.getByRole('checkbox', { name: /Alpha/ })).toBeChecked()
    expect(screen.getByRole('checkbox', { name: /Beta/ })).not.toBeChecked()

    // skipping a re-opened tour changes nothing
    await user.click(screen.getByRole('button', { name: 'Skip for now' }))
    expect(await screen.findByRole('navigation', { name: 'Workspace' })).toBeInTheDocument()
    const nav = screen.getByRole('navigation', { name: 'Workspace' })
    expect(within(nav).getAllByRole('link')[1]).toHaveTextContent('Alpha')
  })
})
