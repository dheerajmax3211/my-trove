import { Button, EmptyState } from '@platform/ui'
import { errorMessage } from '../lib/errors'

export interface ErrorStateProps {
  error: unknown
  onRetry?: () => void
  title?: string
  /** Heading level for the title; use h3 when the state sits inside a section. */
  headingAs?: 'h2' | 'h3'
}

/** A failed request: what happened in plain words, and a way to try again. */
export function ErrorState({
  error,
  onRetry,
  title = 'Could not load this',
  headingAs = 'h2',
}: ErrorStateProps) {
  return (
    <div role="alert">
      <EmptyState
        headingAs={headingAs}
        title={title}
        description={errorMessage(error)}
        action={
          onRetry ? (
            <Button variant="secondary" onClick={onRetry}>
              Try again
            </Button>
          ) : undefined
        }
      />
    </div>
  )
}
