import { Button } from '@platform/ui'
import { describeError } from '../lib/errors'
import { Callout } from './Callout'

/** An error as readable sentences, with a retry when one makes sense. */
export function ErrorNotice({
  error,
  onRetry,
  title = 'Something went wrong',
}: {
  error: unknown
  onRetry?: () => void
  title?: string
}) {
  return (
    <Callout tone="danger" title={title} role="alert">
      <p>{describeError(error)}</p>
      {onRetry ? (
        <div>
          <Button size="sm" variant="secondary" onClick={onRetry}>
            Try again
          </Button>
        </div>
      ) : null}
    </Callout>
  )
}
