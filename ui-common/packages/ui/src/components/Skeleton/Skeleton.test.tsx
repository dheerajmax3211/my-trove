import { render } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { Skeleton } from './Skeleton'

describe('Skeleton', () => {
  it('is hidden from assistive tech and applies dimensions', () => {
    const { container } = render(<Skeleton width={120} height={16} />)
    const el = container.firstElementChild as HTMLElement
    expect(el).toHaveAttribute('aria-hidden', 'true')
    expect(el).toHaveStyle({ width: '120px', height: '16px' })
  })
})
