import { Skeleton } from '@platform/ui'
import type { AccessRequest, Attribute } from '../../../shared/api/types'
import { ErrorState } from '../../../shared/components/ErrorState'
import { SectionHead } from '../../../shared/components/SectionHead'
import { RequestCard } from '../../requests/components/RequestCard'
import { usePendingRequests } from '../../requests/hooks/useRequests'

export interface PendingBandProps {
  attributes: readonly Attribute[] | undefined
  /** How many the dashboard says are waiting, so a skeleton shows only when something will appear. */
  expected: number
  onApprove: (request: AccessRequest) => void
  onDeny: (request: AccessRequest) => void
}

/** Requests waiting for a decision, each in its own card, above everything else. Nothing when nobody is asking. */
export function PendingBand({ attributes, expected, onApprove, onDeny }: PendingBandProps) {
  const pending = usePendingRequests()
  const open = pending.data?.filter((r) => r.status === 'PENDING') ?? []
  if (pending.isPending && expected === 0) return null
  if (!pending.isPending && !pending.isError && open.length === 0) return null

  return (
    <section aria-labelledby="pending-band-title">
      <SectionHead
        id="pending-band-title"
        title="Waiting for your decision"
        count={open.length}
        sub={`${open.length === 1 ? 'An app is' : 'Apps are'} asking to read part of your vault. Nothing is shared until you decide.`}
      />
      {pending.isPending ? (
        <Skeleton height="12rem" />
      ) : pending.isError ? (
        <ErrorState error={pending.error} onRetry={() => void pending.refetch()} />
      ) : (
        <ul className="request-grid" aria-label="Pending requests">
          {open.map((request) => (
            <li key={request.id}>
              <RequestCard
                request={request}
                {...(attributes ? { attributes } : {})}
                onApprove={onApprove}
                onDeny={onDeny}
              />
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
