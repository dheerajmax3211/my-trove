import { fireEvent } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { formatMinor } from '../../lib/money'
import { apiFor } from '../../test/fixtures'
import { findField, getField, renderApp, screen, within } from '../../test/renderApp'

const download = vi.hoisted(() => vi.fn())
vi.mock('../../lib/download', () => ({ downloadTextFile: download }))

beforeEach(() => download.mockReset())

const bodyRows = () =>
  within(screen.getByRole('table', { name: /statement for/i }))
    .getAllByRole('row')
    .slice(1)
const cells = (row: HTMLElement) =>
  within(row)
    .getAllByRole('cell')
    .map((c) => c.textContent)

describe('statement', () => {
  it('pages with a running balance that matches the ledger on every row', async () => {
    const { user, backend, householdId } = renderApp({ path: 'statement' })
    const all = await apiFor(backend, 'u-maya').statement(
      householdId,
      backend.accountOf(householdId, 'POOL').id,
      { size: 500 },
    )
    expect(all.totalRows).toBe(19)

    expect(await screen.findByText('1-10 of 19 (page 1 of 2)')).toBeInTheDocument()
    expect(bodyRows()).toHaveLength(10)
    bodyRows().forEach((row, i) => {
      const c = cells(row)
      expect(c.at(-1)).toBe(formatMinor(all.rows[i]!.balanceMinor, 'USD'))
      expect(c[2]).toBe(all.rows[i]!.description)
    })
    expect(screen.getByRole('button', { name: 'Previous' })).toBeDisabled()

    await user.click(screen.getByRole('button', { name: 'Next' }))
    expect(await screen.findByText('11-19 of 19 (page 2 of 2)')).toBeInTheDocument()
    expect(bodyRows()).toHaveLength(9)
    bodyRows().forEach((row, i) =>
      expect(cells(row).at(-1)).toBe(formatMinor(all.rows[10 + i]!.balanceMinor, 'USD')),
    )
    // The last running balance is the account's current balance.
    expect(cells(bodyRows().at(-1)!).at(-1)).toBe('$2,170.30')
    expect(screen.getByText(/current balance of/i)).toHaveTextContent('$2,170.30')
    expect(screen.getByRole('button', { name: 'Next' })).toBeDisabled()

    await user.click(screen.getByRole('button', { name: 'Previous' }))
    expect(await screen.findByText('1-10 of 19 (page 1 of 2)')).toBeInTheDocument()
  })

  it('changes the page size', async () => {
    const { user } = renderApp({ path: 'statement' })
    await screen.findByText('1-10 of 19 (page 1 of 2)')
    await user.selectOptions(await findField('Rows per page'), '25')
    expect(await screen.findByText('1-19 of 19 (page 1 of 1)')).toBeInTheDocument()
    expect(bodyRows()).toHaveLength(19)
  })

  it('filters by date while keeping balances as full running totals', async () => {
    const { backend, householdId } = renderApp({ path: 'statement?size=50' })
    await screen.findByText(/of 19 \(page 1 of 1\)/)
    fireEvent.change(getField('From date'), { target: { value: '2026-11-10' } })

    const from = new Date(2026, 10, 10).toISOString()
    const expected = await apiFor(backend, 'u-maya').statement(
      householdId,
      backend.accountOf(householdId, 'POOL').id,
      { from, size: 500 },
    )
    expect(expected.totalRows).toBeLessThan(19)
    expect(
      await screen.findByText(new RegExp(`of ${expected.totalRows} \\(page 1 of 1\\)`)),
    ).toBeInTheDocument()
    expect(bodyRows()).toHaveLength(expected.totalRows)
    // First visible row is not zero-based: it carries the balance of everything before it.
    expect(cells(bodyRows()[0]!).at(-1)).toBe(formatMinor(expected.rows[0]!.balanceMinor, 'USD'))
    expect(expected.rows[0]!.balanceMinor).not.toBe(expected.rows[0]!.amountMinor)
    expect(screen.getByRole('button', { name: 'Clear dates' })).toBeInTheDocument()
  })

  it('treats the To date as including that whole day', async () => {
    const { backend, householdId } = renderApp({ path: 'statement?size=50' })
    await screen.findByText(/of 19 \(page 1 of 1\)/)
    fireEvent.change(getField('To date'), { target: { value: '2026-11-13' } })
    const to = new Date(2026, 10, 14).toISOString()
    const expected = await apiFor(backend, 'u-maya').statement(
      householdId,
      backend.accountOf(householdId, 'POOL').id,
      { to, size: 500 },
    )
    expect(await screen.findByText(new RegExp(`of ${expected.totalRows} `))).toBeInTheDocument()
    expect(bodyRows().some((r) => cells(r)[2]?.startsWith('Reversal of: Concert'))).toBe(true)
  })

  it('shows an empty state with a way back when the range has nothing', async () => {
    const { user } = renderApp({ path: 'statement' })
    await screen.findByText(/of 19/)
    fireEvent.change(getField('From date'), { target: { value: '2027-01-01' } })
    expect(await screen.findByText('No entries in this range')).toBeInTheDocument()
    await user.click(
      within(screen.getByRole('main')).getAllByRole('button', { name: 'Clear dates' }).at(-1)!,
    )
    expect(await screen.findByText(/of 19/)).toBeInTheDocument()
  })

  it('switches account', async () => {
    const { user } = renderApp({ path: 'statement' })
    await screen.findByText(/of 19/)
    await user.selectOptions(await findField('Account'), 'Ada Okafor pot')
    expect(await screen.findByText(/current balance of/i)).toHaveTextContent('Ada Okafor pot')
    expect(await screen.findByText('Birthday money for Ada')).toBeInTheDocument()
  })

  it('shows an error with retry', async () => {
    const { user, backend } = renderApp({
      path: 'statement',
      prepare: (b) => b.breakRoute(/\/statement$/),
    })
    expect(await screen.findByRole('alert')).toHaveTextContent(/we could not load the statement/i)
    backend.repair()
    await user.click(screen.getByRole('button', { name: 'Try again' }))
    expect(await screen.findByText(/of 19/)).toBeInTheDocument()
  })
})

describe('CSV export', () => {
  it('downloads the whole statement with exact decimal amounts', async () => {
    const { user } = renderApp({ path: 'statement' })
    await screen.findByText(/of 19/)
    await user.click(screen.getByRole('button', { name: 'Export CSV' }))
    expect(await screen.findByText('Statement exported')).toBeInTheDocument()

    expect(download).toHaveBeenCalledTimes(1)
    const [filename, content, mime] = download.mock.calls[0] as [string, string, string]
    expect(filename).toBe('statement-POOL.csv')
    expect(mime).toBe('text/csv')
    const lines = content.split('\r\n')
    expect(lines[0]).toBe('posted_at,entry_id,kind,description,amount,balance,currency')
    expect(lines).toHaveLength(19 + 2) // header + rows + trailing newline
    const garage = lines.find((l) => l.includes('Garage sale proceeds'))!
    expect(garage.split(',').slice(2)).toEqual([
      'DEPOSIT',
      'Garage sale proceeds',
      '300.00',
      '2170.30',
      'USD',
    ])
    // Not just the visible page.
    expect(content).toContain('October household contributions')
  })

  it('respects the date filter', async () => {
    const { user } = renderApp({ path: 'statement' })
    await screen.findByText(/of 19/)
    fireEvent.change(getField('From date'), { target: { value: '2026-11-12' } })
    await screen.findByRole('button', { name: 'Clear dates' })
    await user.click(screen.getByRole('button', { name: 'Export CSV' }))
    await screen.findByText('Statement exported')
    const content = (download.mock.calls[0] as [string, string, string])[1]
    expect(content).toContain('Garage sale proceeds')
    expect(content).not.toContain('October household contributions')
  })

  it('names the file after the account', async () => {
    const { user } = renderApp({ path: 'statement' })
    await user.selectOptions(await findField('Account'), 'Sam Okafor pot')
    await screen.findByText(/current balance of/i)
    await user.click(screen.getByRole('button', { name: 'Export CSV' }))
    await screen.findByText('Statement exported')
    expect(download.mock.calls[0]![0]).toBe('statement-POT-u-sam.csv')
  })

  it('shows why an export failed', async () => {
    const { user } = renderApp({
      path: 'statement',
      prepare: (b) => b.breakRoute(/statement\.csv$/),
    })
    await screen.findByText(/of 19/)
    await user.click(screen.getByRole('button', { name: 'Export CSV' }))
    expect(await screen.findByText('The export failed')).toBeInTheDocument()
    expect(download).not.toHaveBeenCalled()
  })
})
