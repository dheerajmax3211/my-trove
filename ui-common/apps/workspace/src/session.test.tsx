import { act, screen, waitFor, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { SESSION_REFRESH_MS } from './workspace/SessionGate'
import { fakeAdmin, fakeModule, meFor, problem, renderLive, urlOf } from './testing/harness'

afterEach(() => vi.useRealTimers())

const modules = () => [fakeModule('alpha'), fakeAdmin()]
const sidebar = () => screen.findByRole('navigation', { name: 'Workspace' })

describe('workspace session', () => {
  it('builds the session from GET /auth/v1/me', async () => {
    const { fetchMock } = renderLive({
      modules: modules(),
      persona: 'ADMIN',
      me: () => meFor('ADMIN', { displayName: 'Grace Hopper', email: 'grace@example.test' }),
    })
    const nav = await sidebar()
    expect(within(nav).getByRole('link', { name: 'Admin' })).toBeInTheDocument()
    expect(
      await screen.findByRole('heading', { name: /Good (morning|afternoon|evening), Grace/ }),
    ).toBeInTheDocument()
    const meCall = fetchMock.mock.calls.find(([url]) => urlOf(url).endsWith('/auth/v1/me'))
    expect(urlOf(meCall![0])).toBe('http://localhost:8080/api/auth/v1/me')
    expect(new Headers(meCall?.[1]?.headers).get('authorization')).toBe('Bearer token-user-a')
  })

  it('picks up a role change when the window regains focus', async () => {
    let current = meFor('MEMBER')
    renderLive({ modules: modules(), me: () => current })
    const nav = await sidebar()
    expect(within(nav).queryByRole('link', { name: 'Admin' })).not.toBeInTheDocument()

    // an admin promotes this user while they are signed in
    current = meFor('ADMIN')
    act(() => {
      window.dispatchEvent(new Event('focus'))
    })
    expect(await within(nav).findByRole('link', { name: 'Admin' })).toBeInTheDocument()

    // and a demotion takes the access away again, including the page that is open
    current = meFor('MEMBER')
    act(() => {
      window.dispatchEvent(new Event('focus'))
    })
    await waitFor(() =>
      expect(within(nav).queryByRole('link', { name: 'Admin' })).not.toBeInTheDocument(),
    )
  })

  it('also re-reads when the tab becomes visible again', async () => {
    let current = meFor('MEMBER')
    renderLive({ modules: modules(), me: () => current })
    const nav = await sidebar()
    current = meFor('OWNER')
    act(() => {
      document.dispatchEvent(new Event('visibilitychange'))
    })
    expect(await within(nav).findByRole('link', { name: 'Admin' })).toBeInTheDocument()
  })

  it('re-reads on its own every 60 seconds, so a role change arrives without any interaction', async () => {
    expect(SESSION_REFRESH_MS).toBe(60_000)
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval'] })
    let current = meFor('MEMBER')
    const { fetchMock } = renderLive({ modules: modules(), me: () => current })
    const nav = await sidebar()
    const meCalls = () =>
      fetchMock.mock.calls.filter(([u]) => urlOf(u).endsWith('/auth/v1/me')).length
    const before = meCalls()

    current = meFor('ADMIN')
    act(() => {
      vi.advanceTimersByTime(SESSION_REFRESH_MS)
    })
    expect(await within(nav).findByRole('link', { name: 'Admin' })).toBeInTheDocument()
    expect(meCalls()).toBeGreaterThan(before)
  })

  it('closes the page the user is on when their access is taken away', async () => {
    let current = meFor('ADMIN')
    renderLive({ modules: modules(), me: () => current, path: '/app/admin' })
    expect(
      await screen.findByRole('heading', { name: 'ADMIN CONSOLE CONTENT' }),
    ).toBeInTheDocument()

    current = meFor('MEMBER')
    act(() => {
      window.dispatchEvent(new Event('focus'))
    })
    expect(await screen.findByTestId('forbidden')).toBeInTheDocument()
    expect(screen.queryByText('ADMIN CONSOLE CONTENT')).not.toBeInTheDocument()
  })

  it('keeps the last known session when a later refresh fails', async () => {
    let fail = false
    renderLive({
      modules: modules(),
      persona: 'ADMIN',
      me: () => (fail ? problem(503) : meFor('ADMIN')),
    })
    const nav = await sidebar()
    fail = true
    act(() => {
      window.dispatchEvent(new Event('focus'))
    })
    await new Promise((resolve) => setTimeout(resolve, 50))
    expect(within(nav).getByRole('link', { name: 'Admin' })).toBeInTheDocument()
  })

  it('says so, with a retry, when the profile cannot be loaded at all', async () => {
    let fail = true
    const { user } = renderLive({
      modules: modules(),
      me: () => (fail ? problem(503) : meFor('MEMBER')),
    })
    expect(
      await screen.findByRole('heading', { name: 'We could not open your workspace' }),
    ).toBeInTheDocument()
    expect(screen.queryByRole('navigation', { name: 'Workspace' })).not.toBeInTheDocument()
    fail = false
    await user.click(screen.getByRole('button', { name: 'Try again' }))
    expect(await sidebar()).toBeInTheDocument()
  })
})
