import { render } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { useHotkey, type HotkeyOptions } from './use-hotkey'

function Probe({
  combo,
  onKey,
  options,
}: {
  combo: string
  onKey: () => void
  options?: HotkeyOptions
}) {
  useHotkey(combo, onKey, options)
  return <input aria-label="field" />
}

describe('useHotkey', () => {
  it('fires on mod+k with Ctrl or Meta, even while typing in a field', async () => {
    const onKey = vi.fn()
    const { getByLabelText } = render(<Probe combo="mod+k" onKey={onKey} />)
    await userEvent.keyboard('{Control>}k{/Control}')
    await userEvent.keyboard('{Meta>}k{/Meta}')
    getByLabelText('field').focus()
    await userEvent.keyboard('{Control>}k{/Control}')
    expect(onKey).toHaveBeenCalledTimes(3)
  })

  it('does not fire for a different key or without the modifier', async () => {
    const onKey = vi.fn()
    render(<Probe combo="mod+k" onKey={onKey} />)
    await userEvent.keyboard('k')
    await userEvent.keyboard('{Control>}j{/Control}')
    expect(onKey).not.toHaveBeenCalled()
  })

  it('ignores bare-key hotkeys while typing in an input', async () => {
    const onKey = vi.fn()
    const { getByLabelText } = render(<Probe combo="/" onKey={onKey} />)
    await userEvent.keyboard('/')
    expect(onKey).toHaveBeenCalledTimes(1)
    getByLabelText('field').focus()
    await userEvent.keyboard('/')
    expect(onKey).toHaveBeenCalledTimes(1)
  })

  it('can be disabled and cleans up on unmount', async () => {
    const onKey = vi.fn()
    const { rerender, unmount } = render(
      <Probe combo="mod+k" onKey={onKey} options={{ enabled: false }} />,
    )
    await userEvent.keyboard('{Control>}k{/Control}')
    expect(onKey).not.toHaveBeenCalled()
    rerender(<Probe combo="mod+k" onKey={onKey} />)
    await userEvent.keyboard('{Control>}k{/Control}')
    expect(onKey).toHaveBeenCalledTimes(1)
    unmount()
    await userEvent.keyboard('{Control>}k{/Control}')
    expect(onKey).toHaveBeenCalledTimes(1)
  })
})
