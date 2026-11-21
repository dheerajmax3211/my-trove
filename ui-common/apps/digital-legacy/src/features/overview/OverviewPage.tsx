import { isApiError } from '@platform/api-client'
import { Button, EmptyState, PageHeader } from '@platform/ui'
import { Link } from 'react-router-dom'
import { Callout } from '../../components/Callout'
import { ErrorNotice } from '../../components/ErrorNotice'
import { PageSkeleton } from '../../components/PageSkeleton'
import { useRefreshOwnerData, useStateQuery } from '../queries'
import { ArmCard } from './ArmCard'
import { CheckInCard } from './CheckInCard'
import { PauseCard } from './PauseCard'
import { StatusPanel } from './StatusPanel'

export function OverviewPage() {
  const state = useStateQuery()
  const refresh = useRefreshOwnerData()

  if (state.isPending) return <PageSkeleton label="Loading your switch" />
  if (state.error) {
    if (isApiError(state.error) && state.error.status === 404)
      return (
        <EmptyState
          title="You have no vault yet"
          description="Write what you want to leave behind. It is encrypted in this browser before anything is uploaded."
          action={
            <Button asChild>
              <Link to="/vault">Create your vault</Link>
            </Button>
          }
        />
      )
    return <ErrorNotice error={state.error} onRetry={() => void state.refetch()} />
  }

  const s = state.data
  return (
    <div className="page-stack">
      <PageHeader
        title="Overview"
        description="Is the switch quiet, and what happens next if you go silent."
        actions={
          <Button variant="secondary" loading={state.isFetching} onClick={() => void refresh()}>
            Refresh status
          </Button>
        }
      />
      {s.state === 'RELEASED' ? (
        <Callout tone="danger" title="Released" role="status">
          <p>The vault has been released to your trustees. A check-in can no longer undo it.</p>
        </Callout>
      ) : null}
      <StatusPanel state={s} />
      <div className="grid-2">
        <CheckInCard state={s} />
        <ArmCard state={s} />
      </div>
      <PauseCard state={s} />
    </div>
  )
}
