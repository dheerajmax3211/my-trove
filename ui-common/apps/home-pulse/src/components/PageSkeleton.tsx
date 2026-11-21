import { Skeleton } from '@platform/ui'

/** Placeholder while a page's first request is in flight. Announced once through the busy region. */
export function PageSkeleton({ label = 'Loading' }: { label?: string }) {
  return (
    <div role="status" aria-busy="true" aria-label={label} className="hp-skeleton-page">
      <Skeleton height="2rem" width="40%" />
      <Skeleton height="1rem" width="65%" />
      <Skeleton height="12rem" />
    </div>
  )
}
