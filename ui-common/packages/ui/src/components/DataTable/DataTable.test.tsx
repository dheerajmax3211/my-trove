import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { DataTable, type DataTableColumn } from './DataTable'

interface Row {
  id: string
  name: string
  amount: number | null
}

const data: Row[] = [
  { id: 'a', name: 'Charlie', amount: 30 },
  { id: 'b', name: 'alice', amount: 100 },
  { id: 'c', name: 'Bob', amount: null },
  { id: 'd', name: 'Dana', amount: 5 },
]

const columns: DataTableColumn<Row>[] = [
  { id: 'name', header: 'Name', cell: (r) => r.name, sortValue: (r) => r.name },
  {
    id: 'amount',
    header: 'Amount',
    align: 'end',
    cell: (r) => r.amount ?? '-',
    sortValue: (r) => r.amount,
  },
  { id: 'note', header: 'Note', cell: () => 'n/a' },
]

const names = () =>
  within(screen.getAllByRole('rowgroup')[1] as HTMLElement)
    .getAllByRole('row')
    .map((row) => within(row).getAllByRole('cell')[0]?.textContent)

const renderTable = (props: Partial<Parameters<typeof DataTable<Row>>[0]> = {}) =>
  render(
    <DataTable columns={columns} data={data} getRowId={(r) => r.id} caption="People" {...props} />,
  )

describe('DataTable', () => {
  it('is a labelled table with column headers and rows in the given order', () => {
    renderTable()
    expect(screen.getByRole('table', { name: 'People' })).toBeInTheDocument()
    expect(screen.getAllByRole('columnheader')).toHaveLength(3)
    expect(names()).toEqual(['Charlie', 'alice', 'Bob', 'Dana'])
  })

  it('only exposes sort buttons / aria-sort on sortable columns', () => {
    renderTable()
    expect(screen.getByRole('columnheader', { name: 'Name' })).toHaveAttribute('aria-sort', 'none')
    expect(screen.getByRole('columnheader', { name: 'Note' })).not.toHaveAttribute('aria-sort')
    expect(screen.getAllByRole('button')).toHaveLength(2)
  })

  it('sorts ascending then descending on click, updating aria-sort and announcing it', async () => {
    renderTable()
    const header = screen.getByRole('columnheader', { name: 'Name' })
    await userEvent.click(within(header).getByRole('button'))
    expect(names()).toEqual(['alice', 'Bob', 'Charlie', 'Dana'])
    expect(header).toHaveAttribute('aria-sort', 'ascending')
    expect(screen.getByText('Sorted by Name, ascending')).toBeInTheDocument()
    await userEvent.click(within(header).getByRole('button'))
    expect(names()).toEqual(['Dana', 'Charlie', 'Bob', 'alice'])
    expect(header).toHaveAttribute('aria-sort', 'descending')
  })

  it('is fully keyboard operable: Tab to the header button, Enter/Space to sort', async () => {
    renderTable()
    await userEvent.tab() // scroll region
    await userEvent.tab() // first sort button
    expect(
      within(screen.getByRole('columnheader', { name: 'Name' })).getByRole('button'),
    ).toHaveFocus()
    await userEvent.keyboard('{Enter}')
    expect(names()[0]).toBe('alice')
    await userEvent.keyboard(' ')
    expect(names()[0]).toBe('Dana')
  })

  it('sorts numerically and always keeps empty values last', async () => {
    renderTable()
    const header = screen.getByRole('columnheader', { name: 'Amount' })
    await userEvent.click(within(header).getByRole('button'))
    expect(names()).toEqual(['Dana', 'Charlie', 'alice', 'Bob'])
    await userEvent.click(within(header).getByRole('button'))
    expect(names()).toEqual(['alice', 'Charlie', 'Dana', 'Bob'])
  })

  it('switching columns resets to ascending on the new column', async () => {
    renderTable({ defaultSort: { columnId: 'name', direction: 'desc' } })
    expect(names()[0]).toBe('Dana')
    await userEvent.click(
      within(screen.getByRole('columnheader', { name: 'Amount' })).getByRole('button'),
    )
    expect(screen.getByRole('columnheader', { name: 'Amount' })).toHaveAttribute(
      'aria-sort',
      'ascending',
    )
    expect(screen.getByRole('columnheader', { name: 'Name' })).toHaveAttribute('aria-sort', 'none')
  })

  it('supports controlled sort and manual (server-side) sorting', async () => {
    const onSortChange = vi.fn()
    renderTable({ sort: null, onSortChange, manualSort: true })
    await userEvent.click(
      within(screen.getByRole('columnheader', { name: 'Name' })).getByRole('button'),
    )
    expect(onSortChange).toHaveBeenCalledWith({ columnId: 'name', direction: 'asc' })
    expect(names()).toEqual(['Charlie', 'alice', 'Bob', 'Dana']) // unchanged: parent owns ordering
  })

  it('shows the empty state when there are no rows', () => {
    renderTable({ data: [], emptyState: <p>Nothing here</p> })
    expect(screen.getByText('Nothing here')).toBeInTheDocument()
  })

  it('shows busy skeleton rows while loading', () => {
    renderTable({ loading: true, loadingRows: 3 })
    expect(screen.getByRole('region', { name: 'People' })).toHaveAttribute('aria-busy', 'true')
    expect(screen.queryByText('Charlie')).not.toBeInTheDocument()
    expect(
      within(screen.getAllByRole('rowgroup')[1] as HTMLElement).getAllByRole('row'),
    ).toHaveLength(3)
  })
})
