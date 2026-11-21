import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { Switch } from './Switch'

describe('Switch', () => {
  it('has role=switch, is named by its label and toggles via click and keyboard', async () => {
    const onCheckedChange = vi.fn()
    render(<Switch label="Notifications" onCheckedChange={onCheckedChange} />)
    const sw = screen.getByRole('switch', { name: 'Notifications' })
    expect(sw).toHaveAttribute('aria-checked', 'false')
    await userEvent.click(sw)
    expect(sw).toHaveAttribute('aria-checked', 'true')
    await userEvent.keyboard('{Enter}')
    await userEvent.keyboard(' ')
    expect(onCheckedChange).toHaveBeenCalled()
  })

  it('exposes its description and clicking the label toggles', async () => {
    render(<Switch label="Dark mode" description="Follows system by default" />)
    const sw = screen.getByRole('switch')
    expect(sw).toHaveAccessibleDescription('Follows system by default')
    await userEvent.click(screen.getByText('Dark mode'))
    expect(sw).toBeChecked()
  })

  it('cannot be toggled when disabled', async () => {
    render(<Switch label="Locked" disabled />)
    await userEvent.click(screen.getByRole('switch'))
    expect(screen.getByRole('switch')).not.toBeChecked()
  })
})
