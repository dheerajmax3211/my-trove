import { isApiError } from '@platform/api-client'
import { Skeleton } from '@platform/ui'
import { ErrorNotice } from '../../components/ErrorNotice'
import { PageSkeleton } from '../../components/PageSkeleton'
import { formatDateTime } from '../../lib/format'
import { useRefreshOwnerData, useStateQuery, useTrusteesQuery } from '../queries'
import { ArmCard } from './ArmCard'
import { FirstRun } from './FirstRun'
import { PauseCard } from './PauseCard'
import { StateLadder } from './StateLadder'
import { SwitchHero } from './SwitchHero'
import { TrusteeCircle } from './TrusteeCircle'

export function OverviewPage() {
  const state = useStateQuery()
  const trustees = useTrusteesQuery()
  const refresh = useRefreshOwnerData()

  if (state.isPending) return <PageSkeleton label="Loading your switch" />
  if (state.error) {
    if (isApiError(state.error) && state.error.status === 404) return <FirstRun />
    return <ErrorNotice error={state.error} onRetry={() => void state.refetch()} />
  }

  const s = state.data
  return (
    <div className="page-stack">
      <SwitchHero state={s} refreshing={state.isFetching} onRefresh={() => void refresh()} />
      <dl className="facts" aria-label="At a glance">
        <div>
          <dt>Last check-in</dt>
          <dd>{formatDateTime(s.lastCheckInAt)}</dd>
        </div>
        <div>
          <dt>Next deadline</dt>
          <dd>{s.armed ? formatDateTime(s.nextDueAt) : 'not armed'}</dd>
        </div>
        <div>
          <dt>Trustee approvals</dt>
          <dd>
            {s.quorum.approved} of {s.quorum.required}
          </dd>
        </div>
        <div>
          <dt>Trustees with a share</dt>
          <dd>
            {s.quorum.trusteesHoldingShare} of {s.quorum.trusteesActive}
          </dd>
        </div>
      </dl>
      <StateLadder state={s} />
      {trustees.data ? (
        <TrusteeCircle state={s} trustees={trustees.data} />
      ) : trustees.isPending ? (
        <Skeleton height="10rem" />
      ) : null}
      <div className="grid-2">
        <ArmCard state={s} />
        <PauseCard state={s} />
      </div>
    </div>
  )
}
