import { useId, useMemo, useState, type ReactNode } from 'react'
import { cx } from '../../internal/cx'
import { ArrowDownIcon, ArrowUpIcon, SortIcon } from '../../internal/icons'
import { Skeleton } from '../Skeleton/Skeleton'
import { VisuallyHidden } from '../VisuallyHidden/VisuallyHidden'
import styles from './DataTable.module.css'

export type SortDirection = 'asc' | 'desc'
export interface SortState {
  columnId: string
  direction: SortDirection
}

export type SortValue = string | number | boolean | Date | null | undefined

export interface DataTableColumn<T> {
  id: string
  header: ReactNode
  /** Plain-text column name for screen reader announcements. Defaults to `header` when it is a string. */
  headerLabel?: string
  cell: (row: T, index: number) => ReactNode
  /** Makes the column sortable. Provide `sortValue` to define what is compared. */
  sortValue?: (row: T) => SortValue
  align?: 'start' | 'center' | 'end'
  width?: string
}

export interface DataTableProps<T> {
  columns: readonly DataTableColumn<T>[]
  data: readonly T[]
  getRowId: (row: T, index: number) => string
  /** Accessible name for the table. Required. Visible only when `showCaption` is set. */
  caption: string
  showCaption?: boolean
  /** Uncontrolled initial sort. */
  defaultSort?: SortState | null
  /** Controlled sort state. Pair with `onSortChange`. */
  sort?: SortState | null
  onSortChange?: (sort: SortState | null) => void
  /** Skip client-side sorting (server-side sorting). Sort state is still tracked and announced. */
  manualSort?: boolean
  loading?: boolean
  /** Number of skeleton rows while loading. Default 5. */
  loadingRows?: number
  /** Rendered in place of rows when `data` is empty. */
  emptyState?: ReactNode
  dense?: boolean
  className?: string
}

function compare(a: SortValue, b: SortValue): number {
  if (a == null && b == null) return 0
  if (a == null) return 1 // empty values always last
  if (b == null) return -1
  if (a instanceof Date && b instanceof Date) return a.getTime() - b.getTime()
  if (typeof a === 'number' && typeof b === 'number') return a - b
  if (typeof a === 'boolean' && typeof b === 'boolean') return Number(a) - Number(b)
  return String(a).localeCompare(String(b), undefined, { numeric: true, sensitivity: 'base' })
}

/**
 * Semantic <table> with sortable column headers. Each sortable header contains a real <button>
 * (Tab to reach, Enter/Space to sort), and the <th> exposes aria-sort. Sort changes are announced
 * through a polite live region. The scroll container is focusable so keyboard users can scroll it.
 */
export function DataTable<T>({
  columns,
  data,
  getRowId,
  caption,
  showCaption = false,
  defaultSort = null,
  sort: controlledSort,
  onSortChange,
  manualSort = false,
  loading = false,
  loadingRows = 5,
  emptyState,
  dense = false,
  className,
}: DataTableProps<T>) {
  const [internalSort, setInternalSort] = useState<SortState | null>(defaultSort)
  const sort = controlledSort !== undefined ? controlledSort : internalSort
  const captionId = useId()

  const rows = useMemo(() => {
    if (manualSort || !sort) return data
    const column = columns.find((c) => c.id === sort.columnId)
    if (!column?.sortValue) return data
    const getValue = column.sortValue
    const sign = sort.direction === 'asc' ? 1 : -1
    return data
      .map((row, index) => ({ row, index }))
      .sort((x, y) => {
        const a = getValue(x.row)
        const b = getValue(y.row)
        // Empty values stay last regardless of direction; ties keep original order (stable).
        if (a == null || b == null) return compare(a, b)
        return sign * compare(a, b) || x.index - y.index
      })
      .map(({ row }) => row)
  }, [columns, data, manualSort, sort])

  const toggleSort = (columnId: string) => {
    const next: SortState | null =
      sort?.columnId === columnId
        ? { columnId, direction: sort.direction === 'asc' ? 'desc' : 'asc' }
        : { columnId, direction: 'asc' }
    if (controlledSort === undefined) setInternalSort(next)
    onSortChange?.(next)
  }

  const columnLabel = (c: DataTableColumn<T>) =>
    c.headerLabel ?? (typeof c.header === 'string' ? c.header : c.id)
  const announcement = sort
    ? `Sorted by ${columnLabel(columns.find((c) => c.id === sort.columnId) ?? { id: sort.columnId, header: sort.columnId, cell: () => null })}, ${sort.direction === 'asc' ? 'ascending' : 'descending'}`
    : ''

  const alignClass = (align: DataTableColumn<T>['align']) =>
    align === 'end' ? styles.end : align === 'center' ? styles.center : undefined

  return (
    <div
      className={cx(styles.scroll, dense && styles.dense, className)}
      role="region"
      aria-labelledby={captionId}
      aria-busy={loading || undefined}
      // Scrollable regions must be keyboard focusable (WCAG 2.1.1).
      // eslint-disable-next-line jsx-a11y/no-noninteractive-tabindex
      tabIndex={0}
    >
      <table className={styles.table}>
        <caption id={captionId} className={showCaption ? styles.caption : undefined}>
          {showCaption ? caption : <VisuallyHidden>{caption}</VisuallyHidden>}
        </caption>
        <thead>
          <tr>
            {columns.map((column) => {
              const sortable = Boolean(column.sortValue)
              const active = sort?.columnId === column.id
              const ariaSort = sortable
                ? active
                  ? sort.direction === 'asc'
                    ? 'ascending'
                    : 'descending'
                  : 'none'
                : undefined
              return (
                <th
                  key={column.id}
                  scope="col"
                  aria-sort={ariaSort}
                  className={cx(
                    styles.th,
                    !sortable && styles.thStatic,
                    active && styles.sorted,
                    alignClass(column.align),
                  )}
                  style={column.width ? { width: column.width } : undefined}
                >
                  {sortable ? (
                    <button
                      type="button"
                      className={styles.sortButton}
                      onClick={() => toggleSort(column.id)}
                    >
                      <span>{column.header}</span>
                      <span className={styles.sortIcon} aria-hidden="true">
                        {active ? (
                          sort.direction === 'asc' ? (
                            <ArrowUpIcon size={16} />
                          ) : (
                            <ArrowDownIcon size={16} />
                          )
                        ) : (
                          <SortIcon size={16} />
                        )}
                      </span>
                    </button>
                  ) : (
                    column.header
                  )}
                </th>
              )
            })}
          </tr>
        </thead>
        <tbody>
          {loading
            ? Array.from({ length: loadingRows }, (_, r) => (
                <tr key={`skeleton-${r}`} className={styles.tr}>
                  {columns.map((column) => (
                    <td key={column.id} className={styles.td}>
                      <Skeleton height="1em" width={r % 2 ? '60%' : '80%'} />
                    </td>
                  ))}
                </tr>
              ))
            : rows.map((row, index) => (
                <tr key={getRowId(row, index)} className={styles.tr}>
                  {columns.map((column) => (
                    <td key={column.id} className={cx(styles.td, alignClass(column.align))}>
                      {column.cell(row, index)}
                    </td>
                  ))}
                </tr>
              ))}
          {!loading && rows.length === 0 ? (
            <tr>
              <td colSpan={columns.length} className={cx(styles.td, styles.empty)}>
                {emptyState ?? <VisuallyHidden>No rows</VisuallyHidden>}
              </td>
            </tr>
          ) : null}
        </tbody>
      </table>
      <VisuallyHidden>
        <span role="status" aria-live="polite">
          {announcement}
        </span>
      </VisuallyHidden>
      {loading ? (
        <VisuallyHidden>
          <span role="status">Loading</span>
        </VisuallyHidden>
      ) : null}
    </div>
  )
}
