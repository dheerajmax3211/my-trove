import { screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { renderApp } from '../test/setup'

describe('routes', () => {
  it('shows a not-found page for an unknown address', async () => {
    await renderApp({ path: '/nowhere' })
    expect(await screen.findByRole('heading', { name: 'Page not found' })).toBeInTheDocument()
  })
})
