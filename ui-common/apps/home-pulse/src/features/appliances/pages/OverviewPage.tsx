import {
  BellIcon,
  BentoCard,
  BentoGrid,
  Button,
  PageHeader,
  PlusIcon,
  Skeleton,
} from '@platform/ui'
import { ModuleLink } from '@platform/workspace-kit'
import { useMemo } from 'react'
import { ErrorState } from '../../../components/ErrorState'
import { useDocumentTitle } from '../../../lib/useDocumentTitle'
import { AlertTimeline } from '../../alerts/components/AlertTimeline'
import { useAlerts } from '../../alerts/hooks'
import { ApplianceCard } from '../components/ApplianceCard'
import { FirstRun } from '../components/FirstRun'
import { HomeVerdict } from '../components/HomeVerdict'
import { EnergyCard, HealthMixCard } from '../components/HomeSummaryCards'
import { useAppliances } from '../hooks'

/** Column spans that fill every row: threes where possible, then twos, so no card is left alone on its row. */
export function fillRows(n: number): number[] {
  if (n <= 0) return []
  if (n === 1) return [12]
  if (n === 2) return [6, 6]
  const rest = n % 3
  const threes = rest === 0 ? n : rest === 1 ? n - 4 : n - 2
  const twos = n - threes
  return [...Array<number>(threes).fill(4), ...Array<number>(twos).fill(6)]
}

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

  const spans = fillRows(sorted.length)
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
          className="hp-skeleton-grid"
          role="status"
          aria-busy="true"
          aria-label="Loading appliances"
        >
          <Skeleton height="16rem" />
          <Skeleton height="16rem" />
          <Skeleton height="16rem" />
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
        <BentoGrid>
          <HomeVerdict
            alerts={alerts.data}
            loading={alerts.isPending}
            error={alerts.error}
            applianceCount={appliances.data.length}
            onRetry={() => void alerts.refetch()}
          />
          <HealthMixCard appliances={appliances.data} />
          <EnergyCard appliances={appliances.data} />
          {alerts.data && alerts.data.length > 0 ? (
            <BentoCard
              span={7}
              title="Recent activity"
              icon={<BellIcon size={18} />}
              actions={
                <ModuleLink to="/alerts?status=ALL" className="hp-small">
                  All alerts and history
                </ModuleLink>
              }
            >
              <AlertTimeline alerts={alerts.data} label="Recent alerts" />
            </BentoCard>
          ) : null}
          {sorted.map((appliance, i) => (
            <ApplianceCard key={appliance.id} appliance={appliance} span={spans[i] ?? 4} />
          ))}
        </BentoGrid>
      )}
    </>
  )
}
