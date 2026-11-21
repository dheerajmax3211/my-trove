import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { Checkbox } from './Checkbox'

describe('Checkbox', () => {
  it('toggles with click and Space, reporting the new state', async () => {
    const onCheckedChange = vi.fn()
    render(<Checkbox label="Accept terms" onCheckedChange={onCheckedChange} />)
    const box = screen.getByRole('checkbox', { name: 'Accept terms' })
    expect(box).not.toBeChecked()
    await userEvent.click(box)
    expect(onCheckedChange).toHaveBeenLastCalledWith(true)
    expect(box).toBeChecked()
    await userEvent.keyboard(' ')
    expect(onCheckedChange).toHaveBeenLastCalledWith(false)
  })

  it('clicking the label toggles it', async () => {
    render(<Checkbox label="Newsletter" />)
    await userEvent.click(screen.getByText('Newsletter'))
    expect(screen.getByRole('checkbox', { name: 'Newsletter' })).toBeChecked()
  })

  it('links the description and supports the indeterminate state', () => {
    render(<Checkbox label="All" description="Selects everything" checked="indeterminate" />)
    const box = screen.getByRole('checkbox', { name: 'All' })
    expect(box).toHaveAttribute('aria-checked', 'mixed')
    expect(box).toHaveAccessibleDescription('Selects everything')
  })

  it('is controllable and respects disabled', async () => {
    function Controlled() {
      const [checked, setChecked] = useState(true)
      return (
        <Checkbox
          label="Controlled"
          checked={checked}
          onCheckedChange={(v) => setChecked(v === true)}
        />
      )
    }
    render(<Controlled />)
    await userEvent.click(screen.getByRole('checkbox'))
    expect(screen.getByRole('checkbox')).not.toBeChecked()
  })

  it('does not toggle when disabled', async () => {
    const onCheckedChange = vi.fn()
    render(<Checkbox label="Off" disabled onCheckedChange={onCheckedChange} />)
    await userEvent.click(screen.getByRole('checkbox'))
    expect(onCheckedChange).not.toHaveBeenCalled()
  })
})
