import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { Button } from '../Button/Button'
import { Dialog, DialogClose } from './Dialog'

function Example({ onOpenChange }: { onOpenChange?: (o: boolean) => void }) {
  return (
    <Dialog
      trigger={<Button>Open</Button>}
      title="Delete project"
      description="This cannot be undone."
      onOpenChange={onOpenChange}
      footer={
        <>
          <DialogClose asChild>
            <Button variant="secondary">Cancel</Button>
          </DialogClose>
          <Button variant="danger">Delete</Button>
        </>
      }
    >
      <input aria-label="Confirm name" />
    </Dialog>
  )
}

describe('Dialog', () => {
  it('opens as a labelled, described modal dialog', async () => {
    render(<Example />)
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Open' }))
    const dialog = await screen.findByRole('dialog', { name: 'Delete project' })
    expect(dialog).toHaveAccessibleDescription('This cannot be undone.')
  })

  it('moves focus into the dialog, closes on Escape and restores focus to the trigger', async () => {
    const onOpenChange = vi.fn()
    render(<Example onOpenChange={onOpenChange} />)
    const trigger = screen.getByRole('button', { name: 'Open' })
    await userEvent.click(trigger)
    const dialog = await screen.findByRole('dialog')
    expect(dialog.contains(document.activeElement)).toBe(true)
    await userEvent.keyboard('{Escape}')
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    expect(onOpenChange).toHaveBeenLastCalledWith(false)
    expect(trigger).toHaveFocus()
  })

  it('traps Tab focus inside the dialog', async () => {
    render(<Example />)
    await userEvent.click(screen.getByRole('button', { name: 'Open' }))
    const dialog = await screen.findByRole('dialog')
    for (let i = 0; i < 8; i++) {
      await userEvent.tab()
      expect(dialog.contains(document.activeElement)).toBe(true)
    }
  })

  it('closes from the close button and from a DialogClose action', async () => {
    render(<Example />)
    await userEvent.click(screen.getByRole('button', { name: 'Open' }))
    await userEvent.click(await screen.findByRole('button', { name: 'Close' }))
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    await userEvent.click(screen.getByRole('button', { name: 'Open' }))
    await userEvent.click(await screen.findByRole('button', { name: 'Cancel' }))
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
  })

  it('can be controlled', async () => {
    function Controlled() {
      const [open, setOpen] = useState(true)
      return (
        <>
          <Dialog open={open} onOpenChange={setOpen} title="Controlled" />
          <span>{open ? 'is open' : 'is closed'}</span>
        </>
      )
    }
    render(<Controlled />)
    expect(await screen.findByRole('dialog', { name: 'Controlled' })).toBeInTheDocument()
    await userEvent.keyboard('{Escape}')
    await waitFor(() => expect(screen.getByText('is closed')).toBeInTheDocument())
  })

  it('does not dismiss on Escape when dismissible is false', async () => {
    render(<Dialog defaultOpen dismissible={false} title="Saving" />)
    await screen.findByRole('dialog')
    await userEvent.keyboard('{Escape}')
    expect(screen.getByRole('dialog')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Close' })).not.toBeInTheDocument()
  })
})
