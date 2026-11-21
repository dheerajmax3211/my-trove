import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { createRef } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { Button } from './Button'

describe('Button', () => {
  it('renders a type=button by default and fires onClick', async () => {
    const onClick = vi.fn()
    render(<Button onClick={onClick}>Save</Button>)
    const button = screen.getByRole('button', { name: 'Save' })
    expect(button).toHaveAttribute('type', 'button')
    await userEvent.click(button)
    expect(onClick).toHaveBeenCalledTimes(1)
  })

  it('is activated by Enter and Space', async () => {
    const onClick = vi.fn()
    render(<Button onClick={onClick}>Go</Button>)
    await userEvent.tab()
    expect(screen.getByRole('button')).toHaveFocus()
    await userEvent.keyboard('{Enter}')
    await userEvent.keyboard(' ')
    expect(onClick).toHaveBeenCalledTimes(2)
  })

  it('does not fire when disabled', async () => {
    const onClick = vi.fn()
    render(
      <Button disabled onClick={onClick}>
        Nope
      </Button>,
    )
    await userEvent.click(screen.getByRole('button'))
    expect(onClick).not.toHaveBeenCalled()
    expect(screen.getByRole('button')).toBeDisabled()
  })

  it('loading: announces busy, ignores clicks, but stays focusable', async () => {
    const onClick = vi.fn()
    render(
      <Button loading onClick={onClick}>
        Saving
      </Button>,
    )
    const button = screen.getByRole('button', { name: 'Saving' })
    expect(button).toHaveAttribute('aria-busy', 'true')
    expect(button).toHaveAttribute('aria-disabled', 'true')
    expect(button).not.toBeDisabled()
    await userEvent.click(button)
    expect(onClick).not.toHaveBeenCalled()
    expect(button).toHaveFocus()
  })

  it('forwards refs and extra props', () => {
    const ref = createRef<HTMLButtonElement>()
    render(
      <Button ref={ref} data-testid="b" variant="danger" size="lg">
        x
      </Button>,
    )
    expect(ref.current).toBe(screen.getByTestId('b'))
  })

  it('asChild renders the child element instead of a button', () => {
    render(
      <Button asChild>
        <a href="/docs">Docs</a>
      </Button>,
    )
    expect(screen.getByRole('link', { name: 'Docs' })).toHaveAttribute('href', '/docs')
    expect(screen.queryByRole('button')).not.toBeInTheDocument()
  })

  it('hides decorative icons from assistive tech', () => {
    render(<Button leftIcon={<svg data-testid="icon" />}>With icon</Button>)
    expect(screen.getByTestId('icon').parentElement).toHaveAttribute('aria-hidden', 'true')
    expect(screen.getByRole('button')).toHaveAccessibleName('With icon')
  })
})
