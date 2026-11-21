import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { Logo } from './Logo'

describe('Logo', () => {
  it('is an image named My-Trove by default', () => {
    render(<Logo />)
    expect(screen.getByRole('img', { name: 'My-Trove' })).toBeInTheDocument()
    expect(screen.getByText('Trove')).toBeInTheDocument()
  })

  it('can be decorative when the name is written beside it', () => {
    const { container } = render(<Logo title="" />)
    expect(screen.queryByRole('img')).not.toBeInTheDocument()
    expect(container.querySelector('svg')).toHaveAttribute('aria-hidden', 'true')
  })

  it('renders the mark alone, without the wordmark', () => {
    const { container } = render(<Logo variant="mark" />)
    expect(container.querySelector('text')).toBeNull()
    expect(container.querySelector('path')).not.toBeNull()
  })

  it('renders the wordmark alone, without the tile', () => {
    const { container } = render(<Logo variant="wordmark" />)
    expect(container.querySelector('text')).not.toBeNull()
    expect(container.querySelector('rect')).toBeNull()
  })

  it('mono uses a true cut-out keyhole (a mask) so it follows currentColor on any ground', () => {
    const { container } = render(<Logo variant="mark" tone="mono" />)
    expect(container.querySelector('mask')).not.toBeNull()
    expect(container.querySelector('svg')?.getAttribute('class')).toContain('mono')
  })

  it('scales with the size prop', () => {
    const { container, rerender } = render(<Logo variant="mark" size="sm" />)
    expect(container.querySelector('svg')).toHaveAttribute('height', '24')
    rerender(<Logo variant="mark" size="xl" />)
    expect(container.querySelector('svg')).toHaveAttribute('height', '64')
  })
})
