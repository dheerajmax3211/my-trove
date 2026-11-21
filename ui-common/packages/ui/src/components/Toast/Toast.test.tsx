import { act, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { Button } from '../Button/Button'
import { ToastProvider, useToast } from './Toast'

function Trigger({ onAction }: { onAction?: () => void }) {
  const { toast } = useToast()
  return (
    <Button
      onClick={() =>
        toast({
          title: 'Saved',
          description: 'Your changes are live.',
          variant: 'success',
          duration: Infinity,
          ...(onAction ? { action: { label: 'Undo', onClick: onAction } } : {}),
        })
      }
    >
      Notify
    </Button>
  )
}

describe('Toast', () => {
  it('shows a toast with title and description inside a labelled notifications region', async () => {
    render(
      <ToastProvider>
        <Trigger />
      </ToastProvider>,
    )
    await userEvent.click(screen.getByRole('button', { name: 'Notify' }))
    expect((await screen.findAllByText('Saved')).length).toBeGreaterThan(0)
    expect(screen.getAllByText('Your changes are live.').length).toBeGreaterThan(0)
    expect(screen.getByRole('region', { name: /notifications/i })).toBeInTheDocument()
  })

  it('can be dismissed with its close button', async () => {
    render(
      <ToastProvider>
        <Trigger />
      </ToastProvider>,
    )
    await userEvent.click(screen.getByRole('button', { name: 'Notify' }))
    await userEvent.click(await screen.findByRole('button', { name: 'Dismiss notification' }))
    await waitFor(() =>
      expect(
        screen.queryByRole('button', { name: 'Dismiss notification' }),
      ).not.toBeInTheDocument(),
    )
  })

  it('runs the action callback', async () => {
    const onAction = vi.fn()
    render(
      <ToastProvider>
        <Trigger onAction={onAction} />
      </ToastProvider>,
    )
    await userEvent.click(screen.getByRole('button', { name: 'Notify' }))
    await userEvent.click(await screen.findByRole('button', { name: 'Undo' }))
    expect(onAction).toHaveBeenCalledTimes(1)
  })

  it('auto-dismisses after its duration', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    function Quick() {
      const { toast } = useToast()
      return <Button onClick={() => toast({ title: 'Gone soon', duration: 1000 })}>Go</Button>
    }
    render(
      <ToastProvider>
        <Quick />
      </ToastProvider>,
    )
    await userEvent.click(screen.getByRole('button', { name: 'Go' }))
    expect(await screen.findByRole('button', { name: 'Dismiss notification' })).toBeInTheDocument()
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1500)
    })
    await waitFor(() =>
      expect(
        screen.queryByRole('button', { name: 'Dismiss notification' }),
      ).not.toBeInTheDocument(),
    )
    vi.useRealTimers()
  })

  it('useToast throws outside the provider', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    expect(() => render(<Trigger />)).toThrow(/ToastProvider/)
    spy.mockRestore()
  })
})
