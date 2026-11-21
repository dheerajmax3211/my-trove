import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { Sparkline, sparklinePoints } from './Sparkline'

function mockReducedMotion(reduce: boolean) {
  vi.spyOn(window, 'matchMedia').mockImplementation(
    (query: string) =>
      ({
        matches: reduce && query.includes('prefers-reduced-motion'),
        media: query,
        addEventListener: () => {},
        removeEventListener: () => {},
      }) as unknown as MediaQueryList,
  )
}

describe('sparklinePoints', () => {
  it('scales min to the bottom and max to the top, left to right', () => {
    const pts = sparklinePoints([0, 5, 10], 100, 30)
    expect(pts).toHaveLength(3)
    expect(pts[0]).toEqual([3, 27])
    expect(pts[2]).toEqual([97, 3])
    expect(pts[1]?.[0]).toBe(50)
  })

  it('draws a flat series in the middle and ignores non-finite values', () => {
    const pts = sparklinePoints([4, Number.NaN, 4], 100, 30)
    expect(pts).toHaveLength(2)
    expect(pts[0]?.[1]).toBe(15)
  })

  it('returns nothing for empty data and centres a single point', () => {
    expect(sparklinePoints([], 100, 30)).toEqual([])
    expect(sparklinePoints([7], 100, 30)[0]?.[0]).toBe(50)
  })
})

describe('Sparkline', () => {
  it('is decorative without a label', () => {
    const { container } = render(<Sparkline data={[1, 2, 3]} />)
    expect(container.querySelector('svg')).toHaveAttribute('aria-hidden', 'true')
    expect(screen.queryByRole('img')).not.toBeInTheDocument()
  })

  it('is an image with a label', () => {
    render(<Sparkline data={[1, 2, 3]} label="Requests per day" />)
    expect(screen.getByRole('img', { name: 'Requests per day' })).toBeInTheDocument()
  })

  it('draws a line, an area and an end dot; each can be switched off', () => {
    const { container, rerender } = render(<Sparkline data={[1, 3, 2, 5]} />)
    expect(container.querySelectorAll('path')).toHaveLength(2)
    expect(container.querySelector('circle')).not.toBeNull()
    rerender(<Sparkline data={[1, 3, 2, 5]} area={false} showLast={false} />)
    expect(container.querySelectorAll('path')).toHaveLength(1)
    expect(container.querySelector('circle')).toBeNull()
  })

  it('animates only when asked and motion is allowed', () => {
    mockReducedMotion(false)
    const { container, rerender } = render(<Sparkline data={[1, 2]} />)
    expect(container.querySelector('svg')).not.toHaveAttribute('data-animate')
    rerender(<Sparkline data={[1, 2]} animate />)
    expect(container.querySelector('svg')).toHaveAttribute('data-animate', 'true')
  })

  it('does not animate under prefers-reduced-motion', () => {
    mockReducedMotion(true)
    const { container } = render(<Sparkline data={[1, 2]} animate />)
    expect(container.querySelector('svg')).not.toHaveAttribute('data-animate')
  })
})
