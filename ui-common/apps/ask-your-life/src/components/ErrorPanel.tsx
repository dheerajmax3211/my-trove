import type { ApiError } from '@platform/api-client'
import { Button, EmptyState } from '@platform/ui'

/** A failed request, in words, with a retry. */
export function ErrorPanel({
  error,
  onRetry,
  title = 'That did not work',
}: {
  error: ApiError
  onRetry: () => void
  title?: string
}) {
  const message = error.isNetworkError
    ? 'We could not reach the server. Check your connection and try again.'
    : (error.detail ?? 'Something went wrong on our side. Please try again.')
  return (
    <div role="alert">
      <EmptyState
        title={title}
        description={message}
        headingAs="h2"
        action={<Button onClick={onRetry}>Try again</Button>}
      />
    </div>
  )
}
