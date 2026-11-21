import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { Badge } from './Badge'

describe('Badge', () => {
  it('renders text content so meaning is never conveyed by color alone', () => {
    render(
      <Badge variant="danger" dot>
        Overdue
      </Badge>,
    )
    expect(screen.getByText('Overdue')).toBeInTheDocument()
  })

  it('hides the status dot from assistive tech', () => {
    const { container } = render(<Badge dot>Live</Badge>)
    expect(container.querySelector('[aria-hidden="true"]')).toBeInTheDocument()
  })
})
