import { render, screen, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { Timeline } from './Timeline'

describe('Timeline', () => {
  const items = [
    { id: '1', title: 'Granted', time: 'Today', dateTime: '2026-11-21', tone: 'brass' as const },
    { id: '2', title: 'Created', description: 'By you', meta: <span>meta</span> },
  ]

  it('is a named ordered list in the order given', () => {
    render(<Timeline items={items} label="Activity" />)
    const list = screen.getByRole('list', { name: 'Activity' })
    const rows = within(list).getAllByRole('listitem')
    expect(rows).toHaveLength(2)
    expect(rows[0]).toHaveTextContent('Granted')
    expect(rows[1]).toHaveTextContent('Created')
  })

  it('renders machine-readable times', () => {
    render(<Timeline items={items} />)
    const time = screen.getByText('Today')
    expect(time.tagName).toBe('TIME')
    expect(time).toHaveAttribute('datetime', '2026-11-21')
  })

  it('renders description and meta, and tones each node', () => {
    render(<Timeline items={items} compact />)
    expect(screen.getByText('By you')).toBeInTheDocument()
    expect(screen.getByText('meta')).toBeInTheDocument()
    expect(screen.getAllByRole('listitem')[0]?.className).toContain('brass')
  })

  it('hides the decorative nodes from assistive tech', () => {
    const { container } = render(<Timeline items={items} />)
    for (const node of container.querySelectorAll('li > span'))
      expect(node).toHaveAttribute('aria-hidden', 'true')
  })
})
