import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { Button } from '../Button/Button'
import { EmptyState } from './EmptyState'

describe('EmptyState', () => {
  it('renders heading, description and action', () => {
    render(
      <EmptyState
        title="No requests yet"
        description="Create one to get started."
        action={<Button>New request</Button>}
      />,
    )
    expect(screen.getByRole('heading', { level: 2, name: 'No requests yet' })).toBeInTheDocument()
    expect(screen.getByText('Create one to get started.')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'New request' })).toBeInTheDocument()
  })

  it('hides the decorative icon from assistive tech', () => {
    render(<EmptyState title="Empty" icon={<svg data-testid="i" />} />)
    expect(screen.getByTestId('i').parentElement).toHaveAttribute('aria-hidden', 'true')
  })
})
