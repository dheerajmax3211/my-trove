import { productModule as digitalLegacy } from '@platform/digital-legacy/module'
import { screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { API, authHeader, createTestAuth, renderDemo, renderLive, urlOf } from './testing/harness'

afterEach(() => localStorage.removeItem('dl.trustee.session'))

describe('the trustee portal at /trustee', () => {
  it('needs no account: it opens signed out and talks to Digital Legacy with a trustee token only', async () => {
    const { user, fetchMock } = renderLive({
      path: '/trustee',
      auth: createTestAuth(null),
      modules: [digitalLegacy],
    })
    expect(
      await screen.findByRole('heading', { level: 1, name: 'Trustee portal' }),
    ).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /sign in/i })).not.toBeInTheDocument()

    await user.type(screen.getByLabelText(/^Access token/), 'tok-1')
    await user.click(screen.getByRole('button', { name: 'Open my portal' }))
    await waitFor(() =>
      expect(
        fetchMock.mock.calls.some(([input]) =>
          urlOf(input).startsWith(`${API}/digital-legacy/v1/legacy/trustee/me`),
        ),
      ).toBe(true),
    )
    for (const [input, init] of fetchMock.mock.calls) {
      expect(urlOf(input)).not.toContain('/auth/v1/me')
      expect(authHeader(init)).toBe('Trustee tok-1')
    }
  })

  it('in demo mode answers from the Digital Legacy mock, never the network', async () => {
    const network = vi.spyOn(globalThis, 'fetch')
    const { user } = renderDemo('OWNER', { path: '/trustee', modules: [digitalLegacy] })
    await user.type(await screen.findByLabelText(/^Access token/), 'not-a-token')
    await user.click(screen.getByRole('button', { name: 'Open my portal' }))
    expect(await screen.findByText(/not signed in, or the session has expired/)).toBeInTheDocument()
    expect(network).not.toHaveBeenCalled()
  })
})
