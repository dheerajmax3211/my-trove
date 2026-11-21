import { Button, EmptyState } from '@platform/ui'
import type { ReactNode } from 'react'
import { describeError } from '../lib/errors'

export function ErrorState({
  error,
  title = 'We could not load this',
  onRetry,
  action,
}: {
  error: unknown
  title?: string
  onRetry?: () => void
  action?: ReactNode
}) {
  return (
    <EmptyState
      role="alert"
      title={title}
      description={describeError(error)}
      action={
        <>
          {onRetry ? <Button onClick={onRetry}>Try again</Button> : null}
          {action}
        </>
      }
    />
  )
}
