import { Button } from '@platform/ui'
import { describeError } from '../lib/errors'

export interface ErrorNoticeProps {
  error: unknown
  currency?: string
  title?: string
  onRetry?: () => void
}

/** A readable explanation of a failed request, with an optional retry. */
export function ErrorNotice({ error, currency, title, onRetry }: ErrorNoticeProps) {
  const described = describeError(error, currency ? { currency } : {})
  return (
    <div role="alert" className="ft-notice ft-notice-danger">
      {title ? <strong>{title}</strong> : null}
      <p>{described.message}</p>
      {onRetry ? (
        <Button size="sm" variant="secondary" onClick={onRetry}>
          Try again
        </Button>
      ) : null}
    </div>
  )
}
