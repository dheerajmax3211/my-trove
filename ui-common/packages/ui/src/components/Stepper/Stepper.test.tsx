import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { Stepper } from './Stepper'

const steps = [
  { id: 'a', label: 'Welcome' },
  { id: 'b', label: 'Pin products', description: 'Pick what you use' },
  { id: 'c', label: 'Tips' },
]

describe('Stepper', () => {
  it('is an ordered list with the current step marked', () => {
    render(<Stepper steps={steps} current={1} />)
    const list = screen.getByRole('list', { name: 'Progress' })
    const items = within(list).getAllByRole('listitem')
    expect(items).toHaveLength(3)
    expect(items[1]).toHaveAttribute('aria-current', 'step')
    expect(items[0]).not.toHaveAttribute('aria-current')
  })

  it('states each status in text, not only by color', () => {
    render(<Stepper steps={steps} current={1} />)
    const items = screen.getAllByRole('listitem')
    expect(items[0]).toHaveTextContent('Completed')
    expect(items[1]).toHaveTextContent('Current step')
    expect(items[2]).toHaveTextContent('Not started')
  })

  it('shows descriptions and supports a vertical layout and a custom name', () => {
    render(<Stepper steps={steps} current={0} orientation="vertical" label="Onboarding" />)
    expect(screen.getByRole('list', { name: 'Onboarding' })).toHaveAttribute(
      'data-orientation',
      'vertical',
    )
    expect(screen.getByText('Pick what you use')).toBeInTheDocument()
  })

  it('only completed steps are interactive, and they work from the keyboard', async () => {
    const onStepSelect = vi.fn()
    render(<Stepper steps={steps} current={2} onStepSelect={onStepSelect} />)
    const buttons = screen.getAllByRole('button')
    expect(buttons).toHaveLength(2)
    buttons[0]?.focus()
    await userEvent.keyboard('{Enter}')
    expect(onStepSelect).toHaveBeenCalledWith(0)
    await userEvent.tab()
    await userEvent.keyboard(' ')
    expect(onStepSelect).toHaveBeenLastCalledWith(1)
  })

  it('is not interactive without onStepSelect', () => {
    render(<Stepper steps={steps} current={2} />)
    expect(screen.queryByRole('button')).not.toBeInTheDocument()
  })
})
