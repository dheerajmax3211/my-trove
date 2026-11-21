import { Skeleton, VisuallyHidden } from '@platform/ui'

/** Placeholder while a page's first request is in flight. */
export function PageSkeleton({ label }: { label: string }) {
  return (
    <div className="stack-3" aria-busy="true">
      <VisuallyHidden role="status">{label}</VisuallyHidden>
      <Skeleton height="2rem" width="40%" />
      <Skeleton height="8rem" />
      <Skeleton height="5rem" />
    </div>
  )
}
