import { Badge, Button, PageHeader, Skeleton } from '@platform/ui'
import { ModuleLink } from '@platform/workspace-kit'
import { useParams } from 'react-router-dom'
import { ErrorState } from '../../../components/ErrorState'
import { formatDate } from '../../../lib/format'
import { usePageTitle } from '../../../lib/usePageTitle'
import { DangerZone } from '../components/DangerZone'
import { InvitesCard } from '../components/InvitesCard'
import { MembersCard } from '../components/MembersCard'
import { useHousehold } from '../hooks'

export function HouseholdDetailPage() {
  const { householdId = '' } = useParams()
  const household = useHousehold(householdId)
  usePageTitle(household.data?.name ?? 'Household')

  if (household.isPending)
    return (
      <div className="hub-stack-sm" aria-busy="true" aria-label="Loading household">
        <Skeleton height={32} width="40%" />
        <Skeleton height={160} />
      </div>
    )
  if (household.isError)
    return <ErrorState error={household.error} onRetry={() => void household.refetch()} />

  const h = household.data
  return (
    <>
      <PageHeader
        eyebrow={<ModuleLink to="/households">Households</ModuleLink>}
        title={h.name}
        description={
          <span className="hub-row">
            <span>Created {formatDate(h.createdAt)}.</span>
            <span>Your role:</span>
            <Badge variant={h.callerRole === 'OWNER' ? 'accent' : 'neutral'}>
              {h.callerRole === 'OWNER' ? 'Owner' : 'Member'}
            </Badge>
          </span>
        }
        actions={
          <Button variant="secondary" asChild>
            <ModuleLink to={`/activity?household=${h.id}`}>View activity</ModuleLink>
          </Button>
        }
      />
      <div className="hub-stack">
        <MembersCard household={h} />
        {h.callerRole === 'OWNER' ? <InvitesCard householdId={h.id} /> : null}
        <DangerZone household={h} />
      </div>
    </>
  )
}
