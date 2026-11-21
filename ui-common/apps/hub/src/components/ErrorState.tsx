import { Button, EmptyState, type EmptyStateProps } from '@platform/ui'
import { errorHeading, errorMessage } from '../lib/errors'

interface ErrorStateProps {
  error: unknown
  onRetry?: () => void
  headingAs?: EmptyStateProps['headingAs']
}

/** A failed request: what happened in plain words, plus a way to try again. */
export function ErrorState({ error, onRetry, headingAs }: ErrorStateProps) {
  return (
    <EmptyState
      role="alert"
      title={errorHeading(error)}
      description={errorMessage(error)}
      {...(headingAs ? { headingAs } : {})}
      {...(onRetry ? { action: <Button onClick={onRetry}>Try again</Button> } : {})}
    />
  )
}
