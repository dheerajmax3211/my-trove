import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { CommandPalette, scoreItem, type CommandItem } from './CommandPalette'

function makeItems(onSelect = vi.fn()): CommandItem[] {
  return [
    { id: 'today', label: 'Today', group: 'Go to', onSelect: () => onSelect('today') },
    {
      id: 'consent',
      label: 'Consent',
      group: 'Go to',
      keywords: ['permissions'],
      onSelect: () => onSelect('consent'),
    },
    {
      id: 'account',
      label: 'Account',
      group: 'Go to',
      hint: 'Profile',
      keywords: ['settings'],
      onSelect: () => onSelect('account'),
    },
    { id: 'new', label: 'New request', group: 'Actions', onSelect: () => onSelect('new') },
  ]
}

function Harness({ items, onSelect }: { items?: CommandItem[]; onSelect?: () => void }) {
  const [open, setOpen] = useState(false)
  return (
    <>
      <button type="button" onClick={() => setOpen(true)}>
        Open palette
      </button>
      <CommandPalette
        open={open}
        onOpenChange={setOpen}
        items={items ?? makeItems(onSelect)}
        placeholder="Jump to"
      />
    </>
  )
}

async function openPalette() {
  await userEvent.click(screen.getByRole('button', { name: 'Open palette' }))
  return screen.findByRole('combobox', { name: 'Command palette' })
}

describe('scoreItem', () => {
  const item: CommandItem = {
    id: 'x',
    label: 'New request',
    group: 'Actions',
    keywords: ['follow up'],
    onSelect: () => {},
  }
  it('ranks prefix above word-start above substring above other fields, and 0 for no match', () => {
    expect(scoreItem(item, 'new')).toBeGreaterThan(scoreItem(item, 'req') - 1)
    expect(scoreItem(item, 'new')).toBeGreaterThan(scoreItem(item, 'req'))
    expect(scoreItem(item, 'req')).toBeGreaterThan(scoreItem(item, 'ques'))
    expect(scoreItem(item, 'follow')).toBeGreaterThan(0)
    expect(scoreItem(item, 'zzz')).toBe(0)
  })
  it('requires every word to match', () => {
    expect(scoreItem(item, 'new zzz')).toBe(0)
    expect(scoreItem(item, 'new request')).toBeGreaterThan(0)
  })
  it('matches everything for an empty query', () => {
    expect(scoreItem(item, '  ')).toBeGreaterThan(0)
  })
})

describe('CommandPalette', () => {
  it('renders nothing while closed', () => {
    render(<CommandPalette open={false} onOpenChange={() => {}} items={makeItems()} />)
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('opens as a labelled dialog with a combobox, a listbox and grouped options', async () => {
    render(<Harness />)
    const input = await openPalette()
    expect(screen.getByRole('dialog', { name: 'Command palette' })).toBeInTheDocument()
    expect(input).toHaveFocus()
    expect(input).toHaveAttribute('placeholder', 'Jump to')
    const list = screen.getByRole('listbox')
    expect(within(list).getAllByRole('option')).toHaveLength(4)
    expect(within(list).getAllByRole('group')).toHaveLength(2)
    expect(screen.getByText('Go to')).toBeInTheDocument()
  })

  it('highlights the first option and exposes it with aria-activedescendant', async () => {
    render(<Harness />)
    const input = await openPalette()
    const options = screen.getAllByRole('option')
    expect(options[0]).toHaveAttribute('aria-selected', 'true')
    expect(input).toHaveAttribute('aria-activedescendant', options[0]?.id)
  })

  it('moves with the arrow keys, wraps at both ends, and Home/End jump', async () => {
    render(<Harness />)
    const input = await openPalette()
    await userEvent.keyboard('{ArrowDown}')
    expect(screen.getAllByRole('option')[1]).toHaveAttribute('aria-selected', 'true')
    await userEvent.keyboard('{ArrowUp}{ArrowUp}')
    expect(screen.getAllByRole('option')[3]).toHaveAttribute('aria-selected', 'true')
    await userEvent.keyboard('{ArrowDown}')
    expect(screen.getAllByRole('option')[0]).toHaveAttribute('aria-selected', 'true')
    await userEvent.keyboard('{End}')
    expect(screen.getAllByRole('option')[3]).toHaveAttribute('aria-selected', 'true')
    await userEvent.keyboard('{Home}')
    expect(screen.getAllByRole('option')[0]).toHaveAttribute('aria-selected', 'true')
    expect(input).toHaveFocus()
  })

  it('filters as you type across label, hint and keywords', async () => {
    render(<Harness />)
    await openPalette()
    await userEvent.keyboard('sett')
    const options = screen.getAllByRole('option')
    expect(options).toHaveLength(1)
    expect(options[0]).toHaveTextContent('Account')
    await userEvent.clear(screen.getByRole('combobox'))
    await userEvent.keyboard('profile')
    expect(screen.getAllByRole('option')[0]).toHaveTextContent('Account')
  })

  it('ranks better matches first', async () => {
    render(<Harness />)
    await openPalette()
    await userEvent.keyboard('co')
    expect(screen.getAllByRole('option')[0]).toHaveTextContent('Consent')
  })

  it('says so when nothing matches, and Enter then does nothing', async () => {
    const onSelect = vi.fn()
    render(<Harness onSelect={onSelect} />)
    await openPalette()
    await userEvent.keyboard('zzzz{Enter}')
    expect(screen.getAllByText('No matches').length).toBeGreaterThan(0)
    expect(screen.queryByRole('option')).not.toBeInTheDocument()
    expect(onSelect).not.toHaveBeenCalled()
    expect(screen.getByRole('dialog')).toBeInTheDocument()
  })

  it('Enter runs the highlighted item after closing', async () => {
    const onSelect = vi.fn()
    render(<Harness onSelect={onSelect} />)
    await openPalette()
    await userEvent.keyboard('{ArrowDown}{Enter}')
    expect(onSelect).toHaveBeenCalledWith('consent')
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('clicking an option runs it', async () => {
    const onSelect = vi.fn()
    render(<Harness onSelect={onSelect} />)
    await openPalette()
    await userEvent.click(screen.getByRole('option', { name: /New request/ }))
    expect(onSelect).toHaveBeenCalledWith('new')
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('Escape closes, and focus returns to the element that opened it', async () => {
    render(<Harness />)
    const trigger = screen.getByRole('button', { name: 'Open palette' })
    await openPalette()
    await userEvent.keyboard('{Escape}')
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(trigger).toHaveFocus()
  })

  it('traps focus inside while open', async () => {
    render(<Harness />)
    await openPalette()
    await userEvent.tab()
    await userEvent.tab()
    expect(screen.getByRole('dialog')).toContainElement(document.activeElement as HTMLElement)
  })

  it('starts fresh each time it opens', async () => {
    render(<Harness />)
    await openPalette()
    await userEvent.keyboard('acc')
    await userEvent.keyboard('{Escape}')
    const input = await openPalette()
    expect(input).toHaveValue('')
    expect(screen.getAllByRole('option')).toHaveLength(4)
  })

  it('announces the result count politely', async () => {
    render(<Harness />)
    await openPalette()
    expect(screen.getByRole('status')).toHaveTextContent('4 results')
    await userEvent.keyboard('acc')
    expect(screen.getByRole('status')).toHaveTextContent('1 results')
  })

  it('scrolls the active option into view without smooth scrolling under reduced motion', async () => {
    vi.spyOn(window, 'matchMedia').mockImplementation(
      (query: string) =>
        ({
          matches: query.includes('prefers-reduced-motion'),
          media: query,
          addEventListener: () => {},
          removeEventListener: () => {},
        }) as unknown as MediaQueryList,
    )
    const scroll = vi.spyOn(Element.prototype, 'scrollIntoView')
    render(<Harness />)
    await openPalette()
    await userEvent.keyboard('{ArrowDown}')
    expect(scroll).toHaveBeenCalled()
    for (const call of scroll.mock.calls)
      expect(call[0]).toMatchObject({ block: 'nearest', behavior: 'auto' })
  })

  it('uses smooth scrolling when motion is allowed', async () => {
    const scroll = vi.spyOn(Element.prototype, 'scrollIntoView')
    render(<Harness />)
    await openPalette()
    await userEvent.keyboard('{ArrowDown}')
    expect(scroll).toHaveBeenLastCalledWith({ block: 'nearest', behavior: 'smooth' })
  })
})
