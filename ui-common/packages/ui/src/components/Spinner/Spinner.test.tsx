import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { Spinner } from './Spinner'

describe('Spinner', () => {
  it('exposes a status with a default label', () => {
    render(<Spinner />)
    expect(screen.getByRole('status')).toHaveTextContent('Loading')
  })

  it('supports a custom label', () => {
    render(<Spinner label="Saving draft" />)
    expect(screen.getByRole('status')).toHaveTextContent('Saving draft')
  })

  it('can be decorative (no role, no text)', () => {
    const { container } = render(<Spinner decorative />)
    expect(screen.queryByRole('status')).not.toBeInTheDocument()
    expect(container.firstElementChild).toHaveAttribute('aria-hidden', 'true')
  })
})
