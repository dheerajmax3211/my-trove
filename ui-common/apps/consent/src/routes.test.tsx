import { screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { createMockBackend } from './mock/backend'
import { renderApp } from './test/utils'

describe('routes', () => {
  it('shows a not-found page for unknown routes', async () => {
    renderApp({ route: '/nope' })
    expect(await screen.findByRole('heading', { name: 'Page not found' })).toBeInTheDocument()
  })

  it('signs the session out when the gateway keeps answering 401 after a token refresh', async () => {
    const backend = createMockBackend()
    backend.failNext(/GET \/v1\/owner\/vault\/attributes/, 401, 'The ID token has expired.', 2)
    renderApp({ route: '/vault', backend })
    expect(await screen.findByText('Signed out')).toBeInTheDocument()
  })
})
