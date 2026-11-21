import { KeyCut, Skeleton, VaultRings } from '@platform/ui'
import type { AccessRequest, Attribute } from '../../../shared/api/types'
import { ErrorState } from '../../../shared/components/ErrorState'
import { RequestCard } from '../../requests/components/RequestCard'
import { usePendingRequests } from '../../requests/hooks/useRequests'

export interface PendingBandProps {
  attributes: readonly Attribute[] | undefined
  /** How many the dashboard says are waiting, so a skeleton shows only when something will appear. */
  expected: number
  onApprove: (request: AccessRequest) => void
  onDeny: (request: AccessRequest) => void
}

/**
 * The one bold thing on the home page: requests waiting for a decision, on the vault surface, above
 * everything else. Renders nothing when nobody is asking.
 */
export function PendingBand({ attributes, expected, onApprove, onDeny }: PendingBandProps) {
  const pending = usePendingRequests()
  const open = pending.data?.filter((r) => r.status === 'PENDING') ?? []
  if (pending.isPending && expected === 0) return null
  if (!pending.isPending && !pending.isError && open.length === 0) return null

  return (
    <section className="band" data-surface="vault" aria-labelledby="pending-band-title">
      <VaultRings className="band-rings" />
      <div className="band-head">
        <h2 id="pending-band-title" className="band-title">
          Waiting for your decision
        </h2>
        <p className="band-sub">
          {open.length === 1 ? 'An app is' : 'Apps are'} asking to read part of your vault. Nothing
          is shared until you decide.
        </p>
      </div>
      {pending.isPending ? (
        <Skeleton height="12rem" />
      ) : pending.isError ? (
        <ErrorState error={pending.error} onRetry={() => void pending.refetch()} />
      ) : (
        <ul className="card-list band-list" aria-label="Pending requests">
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
      <KeyCut className="band-keycut" height={18} />
    </section>
  )
}
