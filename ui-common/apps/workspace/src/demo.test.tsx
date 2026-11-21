import { screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { onboardingKey } from './onboarding/OnboardingProvider'
import { createRuntime } from './runtime'
import { fakeAdmin, fakeModule, memoryStorages, mountApp, renderDemo } from './testing/harness'

let network: ReturnType<typeof vi.fn>

beforeEach(() => {
  // Any call that escapes the in-memory mock APIs lands here and fails the test.
  network = vi.fn(() => Promise.reject(new Error('demo mode must not use the network')))
  vi.stubGlobal('fetch', network)
})
afterEach(() => vi.unstubAllGlobals())

const modules = () => [
  fakeModule('alpha', { demoName: 'alpha demo item', todayItems: [] }),
  fakeModule('plain'), // no createDemoFetch: answers 404 problem bodies
  fakeAdmin(),
]

describe('demo mode', () => {
  it('makes no network call while visiting every page, module, the palette and the account', async () => {
    const { user } = renderDemo('OWNER', { modules: modules() })
    const nav = await screen.findByRole('navigation', { name: 'Workspace' })
    await screen.findByRole('heading', { name: /Good (morning|afternoon|evening)/ })

    await user.click(within(nav).getByRole('link', { name: 'Alpha' }))
    expect(await screen.findByText('alpha demo item')).toBeInTheDocument()

    await user.click(within(nav).getByRole('link', { name: 'Plain' }))
    expect(await screen.findByText('items failed')).toBeInTheDocument() // the 404 problem body

    await user.click(within(nav).getByRole('link', { name: 'Admin' }))
    await screen.findByRole('heading', { name: 'ADMIN CONSOLE CONTENT' })

    await user.click(within(nav).getByRole('link', { name: 'Account' }))
    await screen.findByRole('heading', { name: 'Account' })

    await user.keyboard('{Control>}k{/Control}')
    await screen.findByRole('dialog', { name: 'Search the workspace' })
    await user.keyboard('{Escape}')

    expect(network).not.toHaveBeenCalled()
  })

  it('is visibly labelled as demo data', async () => {
    renderDemo('MEMBER', { modules: modules() })
    await screen.findByRole('navigation', { name: 'Workspace' })
    expect(screen.getByText('Demo data', { selector: 'span' })).toBeInTheDocument()
    expect(screen.getByText(/Made up, and kept in this tab only/)).toBeInTheDocument()
  })

  it('shows the Demo data label on the first-run wizard too', async () => {
    renderDemo('MEMBER', { modules: modules(), onboarded: false })
    await screen.findByRole('heading', { name: 'Welcome to My-Trove' })
    expect(screen.getByText('Demo data')).toBeInTheDocument()
  })

  it('answers the workspace usage meter from memory', async () => {
    renderDemo('MEMBER', { modules: modules() })
    expect(await screen.findByRole('meter', { name: 'Requests used this month' })).toHaveAttribute(
      'aria-valuemax',
      '10000',
    )
    expect(network).not.toHaveBeenCalled()
  })

  it('lets the owner switch persona and re-reads the session', async () => {
    const { user } = renderDemo('OWNER', { modules: modules() })
    const nav = await screen.findByRole('navigation', { name: 'Workspace' })
    expect(within(nav).getByRole('link', { name: 'Admin' })).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: /Account menu/ }))
    const member = screen.getByRole('button', { name: 'Member' })
    expect(screen.getByRole('button', { name: 'Owner' })).toHaveAttribute('aria-pressed', 'true')
    await user.click(member)

    await waitFor(() =>
      expect(within(nav).queryByRole('link', { name: 'Admin' })).not.toBeInTheDocument(),
    )
    expect(member).toHaveAttribute('aria-pressed', 'true')
    expect(document.querySelector('header [data-persona]')).toHaveAttribute(
      'data-persona',
      'MEMBER',
    )
    expect(network).not.toHaveBeenCalled()
  })

  it('shows the persona that was chosen for this tab after a reload', async () => {
    const storage = memoryStorages()
    const first = renderDemo('AUDITOR', { modules: modules(), storage })
    await screen.findByRole('navigation', { name: 'Workspace' })
    first.unmount()
    const runtime = createRuntime({}, { search: '', storage, retryQueries: false })
    mountApp(runtime, modules(), '/')
    const nav = await screen.findByRole('navigation', { name: 'Workspace' })
    expect(within(nav).queryByRole('link', { name: 'Alpha' })).not.toBeInTheDocument()
    expect(within(nav).getByRole('link', { name: 'Admin' })).toBeInTheDocument()
  })
})

describe('?demo=1 cannot reach real data', () => {
  it('uses a stub identity and mock APIs even when the build is wired to a real gateway', async () => {
    const live = vi.fn<typeof fetch>(() => Promise.reject(new Error('reached the real gateway')))
    const storage = memoryStorages()
    storage.local?.setItem(
      onboardingKey('demo-user'),
      JSON.stringify({ status: 'done', pinned: [] }),
    )
    const runtime = createRuntime(
      {
        VITE_DEV_IDP_URL: 'http://idp.test',
        VITE_API_BASE_URL: 'https://gateway.example/api',
      },
      { search: '?demo=1', storage, fetch: live, retryQueries: false },
    )
    expect(runtime.mode).toBe('demo')
    expect(runtime.demo).not.toBeNull()
    expect(runtime.workspaceFetch).not.toBe(live)
    for (const module of modules()) expect(runtime.moduleFetch(module)).not.toBe(live)

    runtime.demo?.setPersona('MEMBER')
    // the stub signs in on its own; walk the workspace
    const { user } = mountApp(runtime, modules(), '/app/alpha')
    expect(await screen.findByText('alpha demo item')).toBeInTheDocument()
    await user.click(
      within(screen.getByRole('navigation', { name: 'Workspace' })).getByRole('link', {
        name: 'Plain',
      }),
    )
    expect(await screen.findByText('items failed')).toBeInTheDocument()

    expect(live).not.toHaveBeenCalled()
    expect(network).not.toHaveBeenCalled()
  })

  it('does not mistake a normal load for demo', () => {
    const runtime = createRuntime(
      { VITE_DEV_IDP_URL: 'http://idp.test' },
      { search: '', storage: memoryStorages() },
    )
    expect(runtime.mode).toBe('live')
  })
})
