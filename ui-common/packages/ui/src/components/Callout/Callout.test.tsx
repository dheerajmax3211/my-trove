import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { Callout } from './Callout'

describe('Callout', () => {
  it('renders title, body and action', () => {
    render(
      <Callout title="Read-only" action={<button type="button">Review</button>}>
        Ask the owner.
      </Callout>,
    )
    expect(screen.getByText('Read-only')).toBeInTheDocument()
    expect(screen.getByText('Ask the owner.')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Review' })).toBeInTheDocument()
  })

  it('announces danger and warning as alerts, others as notes', () => {
    const { rerender } = render(<Callout variant="danger">Failed</Callout>)
    expect(screen.getByRole('alert')).toBeInTheDocument()
    rerender(<Callout variant="warning">Careful</Callout>)
    expect(screen.getByRole('alert')).toBeInTheDocument()
    rerender(<Callout variant="info">FYI</Callout>)
    expect(screen.getByRole('note')).toBeInTheDocument()
    rerender(<Callout variant="note">Brass</Callout>)
    expect(screen.getByRole('note')).toBeInTheDocument()
  })

  it('lets the caller override the role', () => {
    render(
      <Callout variant="danger" role="status">
        Saved
      </Callout>,
    )
    expect(screen.getByRole('status')).toBeInTheDocument()
  })

  it('hides the glyph from assistive tech and can drop it', () => {
    const { container, rerender } = render(<Callout variant="success">Done</Callout>)
    expect(container.querySelector('svg')?.parentElement).toHaveAttribute('aria-hidden', 'true')
    rerender(
      <Callout variant="success" icon={null}>
        Done
      </Callout>,
    )
    expect(container.querySelector('svg')).toBeNull()
  })
})
