import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { IconButton } from './IconButton'

describe('IconButton', () => {
  it('is named by its required label', () => {
    render(<IconButton label="Delete item" icon={<svg />} />)
    expect(screen.getByRole('button', { name: 'Delete item' })).toBeInTheDocument()
  })

  it('fires onClick', async () => {
    const onClick = vi.fn()
    render(<IconButton label="Add" icon={<svg />} onClick={onClick} />)
    await userEvent.click(screen.getByRole('button', { name: 'Add' }))
    expect(onClick).toHaveBeenCalled()
  })

  it('shows its label in a tooltip on keyboard focus when tooltip is enabled', async () => {
    render(<IconButton label="Settings" icon={<svg />} tooltip />)
    await userEvent.tab()
    expect(await screen.findByRole('tooltip')).toHaveTextContent('Settings')
  })
})
