import { Button, EmptyState, PageHeader, PlusIcon, Skeleton } from '@platform/ui'
import { ModuleLink } from '@platform/workspace-kit'
import { ErrorState } from '../../../components/ErrorState'
import { useDocumentTitle } from '../../../lib/useDocumentTitle'
import { ApplianceCard } from '../components/ApplianceCard'
import { useAppliances } from '../hooks'

export function OverviewPage() {
  useDocumentTitle('Home')
  const appliances = useAppliances()

  return (
    <>
      <PageHeader
        title="Home"
        description="How each appliance is doing, based on its power draw."
        actions={
          <Button asChild leftIcon={<PlusIcon size={18} />}>
            <ModuleLink to="/appliances/new">Add appliance</ModuleLink>
          </Button>
        }
      />
      {appliances.isPending ? (
        <div
          className="hp-card-grid"
          role="status"
          aria-busy="true"
          aria-label="Loading appliances"
        >
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} height="10rem" />
          ))}
        </div>
      ) : appliances.isError ? (
        <ErrorState
          title="Could not load your appliances"
          error={appliances.error}
          onRetry={() => void appliances.refetch()}
        />
      ) : appliances.data.length === 0 ? (
        <EmptyState
          title="Add your first appliance"
          description="Home Pulse learns what normal looks like for each appliance and warns you before it fails. Start by adding the appliance, then register a smart plug or sensor for it. The plug reports power readings using a one-time token that we show you right after you register it."
          action={
            <Button asChild>
              <ModuleLink to="/appliances/new">Add an appliance</ModuleLink>
            </Button>
          }
        />
      ) : (
        <ul className="hp-card-grid" aria-label="Appliances">
          {appliances.data.map((appliance) => (
            <li key={appliance.id}>
              <ApplianceCard appliance={appliance} />
            </li>
          ))}
        </ul>
      )}
    </>
  )
}
