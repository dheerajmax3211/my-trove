import { isApiError } from '@platform/api-client'
import { BentoCard, BentoGrid, ClockIcon, Skeleton } from '@platform/ui'
import type { CSSProperties } from 'react'
import type { StateView } from '../../api/types'
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

/** The four figures worth a glance, as a card beside the hero. BentoGrid hands its children a className and style. */
function Facts({
  state: s,
  className,
  style,
}: {
  state: StateView
  className?: string
  style?: CSSProperties
}) {
  return (
    <BentoCard
      span={4}
      title="At a glance"
      icon={<ClockIcon size={18} />}
      {...(className ? { className } : {})}
      {...(style ? { style } : {})}
    >
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
    </BentoCard>
  )
}

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
    <BentoGrid>
      <SwitchHero state={s} refreshing={state.isFetching} onRefresh={() => void refresh()} />
      <Facts state={s} />
      <StateLadder state={s} />
      {trustees.data ? (
        <TrusteeCircle state={s} trustees={trustees.data} />
      ) : trustees.isPending ? (
        <BentoCard span={7} title="Your trustees">
          <Skeleton height="10rem" />
        </BentoCard>
      ) : null}
      <ArmCard state={s} />
      <PauseCard state={s} />
    </BentoGrid>
  )
}
