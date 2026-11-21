import { Button, EmptyState, AlertIcon } from '@platform/ui'
import { describeError } from '../lib/errors'

export interface ErrorStateProps {
  error: unknown
  onRetry?: () => void
  /** Overrides the headline derived from the error. */
  title?: string
}

/** A failed load: readable message plus a retry. Used in place of the content that could not load. */
export function ErrorState({ error, onRetry, title }: ErrorStateProps) {
  const described = describeError(error)
  return (
    <EmptyState
      icon={<AlertIcon size={24} />}
      title={title ?? described.title}
      description={described.message}
      headingAs="h2"
      role="alert"
      {...(onRetry ? { action: <Button onClick={onRetry}>Try again</Button> } : {})}
    />
  )
}
