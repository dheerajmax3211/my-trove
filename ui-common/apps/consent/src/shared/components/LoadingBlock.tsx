import { Skeleton, Spinner } from '@platform/ui'

export interface LoadingBlockProps {
  /** Announced to screen readers, e.g. "Loading requests". */
  label: string
  rows?: number
}

export function LoadingBlock({ label, rows = 3 }: LoadingBlockProps) {
  return (
    <div className="loading-block" aria-busy="true">
      <Spinner label={label} />
      {Array.from({ length: rows }, (_, i) => (
        <Skeleton key={i} height="3.5rem" />
      ))}
    </div>
  )
}
