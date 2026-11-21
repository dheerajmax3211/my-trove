import { Button, PageHeader, PlusIcon, Skeleton } from '@platform/ui'
import { ModuleLink } from '@platform/workspace-kit'
import { useMemo } from 'react'
import { ErrorState } from '../../../components/ErrorState'
import { useDocumentTitle } from '../../../lib/useDocumentTitle'
import { AlertTimeline } from '../../alerts/components/AlertTimeline'
import { useAlerts } from '../../alerts/hooks'
import { ApplianceCard } from '../components/ApplianceCard'
import { FirstRun } from '../components/FirstRun'
import { HomeVerdict } from '../components/HomeVerdict'
import { useAppliances } from '../hooks'

export function OverviewPage() {
  useDocumentTitle('Home')
  const appliances = useAppliances()
  // One request feeds both the verdict (open and acknowledged alerts) and the recent-activity timeline.
  const alerts = useAlerts('ALL')

  const sorted = useMemo(() => {
    const openBy = new Map<string, number>()
    for (const a of alerts.data ?? [])
      if (a.status === 'OPEN') openBy.set(a.applianceId, (openBy.get(a.applianceId) ?? 0) + 1)
    return [...(appliances.data ?? [])].sort(
      (a, b) => (openBy.get(b.id) ?? 0) - (openBy.get(a.id) ?? 0),
    )
  }, [appliances.data, alerts.data])

  const firstRun = appliances.isSuccess && appliances.data.length === 0

  return (
    <>
      <PageHeader
        title="Home"
        description={
          firstRun
            ? 'Predictive maintenance for your appliances, from the power they draw.'
            : 'How each appliance is doing, based on its power draw.'
        }
        actions={
          firstRun ? null : (
            <Button asChild leftIcon={<PlusIcon size={18} />}>
              <ModuleLink to="/appliances/new">Add appliance</ModuleLink>
            </Button>
          )
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
            <Skeleton key={i} height="16rem" />
          ))}
        </div>
      ) : appliances.isError ? (
        <ErrorState
          title="Could not load your appliances"
          error={appliances.error}
          onRetry={() => void appliances.refetch()}
        />
      ) : appliances.data.length === 0 ? (
        <FirstRun />
      ) : (
        <div className="hp-home">
          <HomeVerdict
            alerts={alerts.data}
            loading={alerts.isPending}
            error={alerts.error}
            applianceCount={appliances.data.length}
            onRetry={() => void alerts.refetch()}
          />
          <section aria-labelledby="hp-appliances-title" className="hp-section">
            <h2 id="hp-appliances-title" className="hp-section-title">
              Your appliances
            </h2>
            <ul className="hp-card-grid" aria-label="Appliances">
              {sorted.map((appliance) => (
                <li key={appliance.id}>
                  <ApplianceCard appliance={appliance} />
                </li>
              ))}
            </ul>
          </section>
          {alerts.data && alerts.data.length > 0 ? (
            <section aria-labelledby="hp-activity-title" className="hp-section hp-activity">
              <div className="hp-home-head">
                <h2 id="hp-activity-title" className="hp-section-title">
                  Recent activity
                </h2>
                <ModuleLink to="/alerts?status=ALL" className="hp-small">
                  All alerts and history
                </ModuleLink>
              </div>
              <AlertTimeline alerts={alerts.data} label="Recent alerts" />
            </section>
          ) : null}
        </div>
      )}
    </>
  )
}
