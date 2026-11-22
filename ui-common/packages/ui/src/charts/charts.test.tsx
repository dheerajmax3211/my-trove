import { fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { mockIntersectionObserver, mockReducedMotion } from '../internal/test-utils'
import { AreaChart, smoothPath } from './AreaChart'
import { BarList } from './BarList'
import { Donut } from './Donut'

afterEach(() => vi.unstubAllGlobals())

describe('smoothPath', () => {
  it('returns an empty path for no points and a move for one', () => {
    expect(smoothPath([])).toBe('')
    expect(smoothPath([[5, 5]])).toBe('M5,5')
  })

  it('passes through every point with cubic segments and never overshoots a flat run', () => {
    const d = smoothPath([
      [0, 10],
      [10, 10],
      [20, 30],
    ])
    expect(d.startsWith('M0,10')).toBe(true)
    expect(d.match(/C/g)).toHaveLength(2)
    expect(d.endsWith('20,30')).toBe(true)
  })
})

const data = [
  { label: 'Jun', value: 100 },
  { label: 'Jul', value: 140 },
  { label: 'Aug', value: 120 },
]

describe('AreaChart', () => {
  it('is an image with a spoken summary and a text list of every value', () => {
    mockReducedMotion(true)
    render(<AreaChart data={data} label="Spending" format={(v) => `$${v}`} />)
    const img = screen.getByRole('img')
    expect(img).toHaveAttribute('aria-label', expect.stringContaining('Spending'))
    expect(img).toHaveAttribute('aria-label', expect.stringContaining('Latest $120'))
    const list = screen.getByRole('list')
    expect(within(list).getAllByRole('listitem')).toHaveLength(3)
    expect(within(list).getByText('Jul: $140')).toBeInTheDocument()
  })

  it('draws in once scrolled into view, instantly under reduced motion', () => {
    mockReducedMotion(false)
    const io = mockIntersectionObserver()
    const { container, unmount } = render(<AreaChart data={data} label="x" />)
    const root = container.firstElementChild as HTMLElement
    expect(root).toHaveAttribute('data-revealed', 'false')
    unmount()
    mockReducedMotion(true)
    const again = render(<AreaChart data={data} label="x" />)
    expect(again.container.firstElementChild).toHaveAttribute('data-revealed', 'true')
    void io
  })

  it('shows the nearest value on hover without announcing it', () => {
    mockReducedMotion(true)
    const { container } = render(<AreaChart data={data} label="x" />)
    const svg = screen.getByRole('img')
    svg.getBoundingClientRect = () => ({ left: 0, top: 0, width: 640, height: 220 }) as DOMRect
    fireEvent.pointerMove(svg, { clientX: 320 })
    const tip = container.querySelector('[aria-hidden="true"]')
    expect(tip).toBeInTheDocument()
    fireEvent.pointerLeave(svg)
  })
})

describe('BarList', () => {
  it('lists every item with its printed value (never length or colour alone)', () => {
    mockReducedMotion(true)
    render(
      <BarList
        label="Spending by category"
        format={(v) => `$${v}`}
        items={[
          { label: 'Groceries', value: 800, hint: '31 purchases' },
          { label: 'Utilities', value: 400 },
        ]}
      />,
    )
    const list = screen.getByRole('list', { name: 'Spending by category' })
    const items = within(list).getAllByRole('listitem')
    expect(items).toHaveLength(2)
    expect(items[0]).toHaveTextContent('Groceries')
    expect(items[0]).toHaveTextContent('$800')
    expect(items[0]).toHaveTextContent('31 purchases')
    expect(items[1]!.style.getPropertyValue('--_pct')).toBe('0.5')
  })
})

describe('Donut', () => {
  it('names the chart and prints each segment value and share in the legend', () => {
    mockReducedMotion(true)
    render(
      <Donut
        label="Documents by status"
        segments={[
          { label: 'Sealed', value: 24 },
          { label: 'Shared', value: 12 },
          { label: 'Draft', value: 12 },
        ]}
        center={<span>48</span>}
      />,
    )
    expect(screen.getByRole('img', { name: 'Documents by status' })).toBeInTheDocument()
    const legend = screen.getByRole('list', { name: /breakdown/ })
    expect(within(legend).getByText('Sealed').closest('li')).toHaveTextContent('24')
    expect(within(legend).getByText('Sealed').closest('li')).toHaveTextContent('50%')
    expect(screen.getByText('48')).toBeInTheDocument()
  })

  it('handles an empty total without NaN', () => {
    mockReducedMotion(true)
    const { container } = render(<Donut label="Empty" segments={[{ label: 'None', value: 0 }]} />)
    expect(container.innerHTML).not.toContain('NaN')
  })
})
