import { isApiError } from '@platform/api-client'
import {
  ActivityIcon,
  BentoCard,
  BentoGrid,
  Button,
  EmptyState,
  Illustration,
  PageHeader,
  Skeleton,
  VisuallyHidden,
} from '@platform/ui'
import { ModuleLink } from '@platform/workspace-kit'
import { useParams } from 'react-router-dom'
import { ErrorState } from '../../../components/ErrorState'
import { usePageTitle } from '../../../lib/usePageTitle'
import { ActionsCard } from '../components/ActionsCard'
import { DetailsCard } from '../components/DetailsCard'
import { FollowUpCard } from '../components/FollowUpCard'
import { LetterPreview } from '../components/LetterPreview'
import { ReplyCard } from '../components/ReplyCard'
import { PlanCard } from '../components/PlanCard'
import { StatusBadge } from '../components/StatusBadge'
import { ItemTimeline } from '../components/Timeline'
import { useItem, useTimeline } from '../hooks/useItems'

function TimelineCard({ itemId }: { itemId: string }) {
  const timeline = useTimeline(itemId)
  let body
  if (timeline.isPending)
    body = (
      <div className="wo-stack" role="status" aria-label="Loading timeline">
        <Skeleton height={18} width="40%" />
        <Skeleton height={44} />
        <Skeleton height={44} />
      </div>
    )
  else if (timeline.isError)
    body = (
      <ErrorState
        title="We could not load the timeline"
        error={timeline.error}
        onRetry={() => void timeline.refetch()}
      />
    )
  else body = <ItemTimeline events={timeline.data} />
  return (
    <BentoCard span={7} title="Timeline" icon={<ActivityIcon size={18} />}>
      {body}
    </BentoCard>
  )
}

export function ItemDetailPage() {
  const { id = '' } = useParams()
  const item = useItem(id)
  usePageTitle(item.data?.title ?? 'Item')

  const back = <ModuleLink to="/">Back to waiting list</ModuleLink>

  if (item.isError) {
    const missing =
      isApiError(item.error) && (item.error.status === 404 || item.error.status === 400)
    return (
      <>
        <PageHeader eyebrow={back} title={missing ? 'Item not found' : 'Item unavailable'} />
        <div className="wo-page">
          {missing ? (
            <EmptyState
              role="alert"
              illustration={<Illustration name="search" />}
              title="We could not find that item"
              description="It may have been removed, or the link may be wrong. Items are private to the account that created them."
              action={
                <Button asChild>
                  <ModuleLink to="/">Go to your waiting list</ModuleLink>
                </Button>
              }
            />
          ) : (
            <ErrorState
              title="We could not load this item"
              error={item.error}
              onRetry={() => void item.refetch()}
            />
          )}
        </div>
      </>
    )
  }

  if (item.isPending)
    return (
      <>
        <PageHeader eyebrow={back} title="Loading item" />
        <div className="wo-page" aria-busy="true">
          <VisuallyHidden role="status">Loading item</VisuallyHidden>
          <Skeleton height={260} style={{ borderRadius: 'var(--pp-radius-xl)' }} />
          <Skeleton height={200} style={{ borderRadius: 'var(--pp-radius-xl)' }} />
        </div>
      </>
    )

  const data = item.data
  return (
    <>
      <PageHeader
        eyebrow={back}
        title={data.title}
        description={`Waiting on ${data.counterparty}`}
        actions={<StatusBadge status={data.status} />}
      />
      <BentoGrid>
        <FollowUpCard item={data} onRetry={() => void item.refetch()} />
        <DetailsCard item={data} />
        <ActionsCard item={data} />
        <LetterPreview itemId={data.id} />
        <PlanCard item={data} />
        <TimelineCard itemId={data.id} />
        <ReplyCard itemId={data.id} counterparty={data.counterparty} />
      </BentoGrid>
    </>
  )
}
