import { Button } from '@platform/ui'

interface PagerProps {
  page: number
  size: number
  total: number
  onPageChange: (page: number) => void
}

/** Zero-based `page`, matching the audit API. */
export function Pager({ page, size, total, onPageChange }: PagerProps) {
  const first = total === 0 ? 0 : page * size + 1
  const last = Math.min((page + 1) * size, total)
  return (
    <nav className="hub-pager" aria-label="Pagination">
      <p className="hub-muted" aria-live="polite">
        Showing {first} to {last} of {total}
      </p>
      <div className="hub-row">
        <Button
          variant="secondary"
          size="sm"
          disabled={page === 0}
          onClick={() => onPageChange(page - 1)}
        >
          Previous
        </Button>
        <Button
          variant="secondary"
          size="sm"
          disabled={last >= total}
          onClick={() => onPageChange(page + 1)}
        >
          Next
        </Button>
      </div>
    </nav>
  )
}
