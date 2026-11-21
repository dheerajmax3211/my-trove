import { render, screen, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { Stat } from './Stat'

describe('Stat', () => {
  it('is a group named by its label and shows the value', () => {
    render(<Stat label="Requests" value="1,284" />)
    const group = screen.getByRole('group', { name: 'Requests' })
    expect(within(group).getByText('1,284')).toBeInTheDocument()
  })

  it('speaks the direction of the change, not just the arrow', () => {
    render(<Stat label="Requests" value="10" delta="+12%" trend="up" />)
    expect(screen.getByText(/Up,/)).toBeInTheDocument()
    expect(screen.getByText(/\+12%/)).toBeInTheDocument()
  })

  it('treats a fall as good news when down is the good direction (error rate)', () => {
    render(<Stat label="Errors" value="0.4%" delta="-0.2 pts" trend="down" goodDirection="down" />)
    expect(screen.getByText(/-0.2 pts/).className).toContain('good')
  })

  it('treats a fall as bad news by default', () => {
    render(<Stat label="Users" value="9" delta="-2" trend="down" />)
    expect(screen.getByText(/-2/).className).toContain('bad')
  })

  it('renders hint text and a described sparkline', () => {
    render(
      <Stat
        label="Latency"
        value="42 ms"
        hint="vs. last week"
        sparkline={[3, 4, 2, 5]}
        sparklineLabel="Latency per hour"
      />,
    )
    expect(screen.getByText('vs. last week')).toBeInTheDocument()
    expect(screen.getByRole('img', { name: 'Latency per hour' })).toBeInTheDocument()
  })

  it('omits the trend line when there are fewer than two points', () => {
    const { container } = render(<Stat label="A" value="1" sparkline={[1]} />)
    expect(container.querySelector('svg[viewBox]')).toBeNull()
  })
})
