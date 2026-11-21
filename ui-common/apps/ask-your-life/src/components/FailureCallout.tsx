import { Callout } from '@platform/ui'
import type { FriendlyError } from '../features/documents/api/documentsApi'

/** An add, replace or delete that did not work: what happened, then what to do about it. */
export function FailureCallout({ failure }: { failure: FriendlyError }) {
  return (
    <Callout variant="danger" title={failure.title}>
      {failure.message}
    </Callout>
  )
}
