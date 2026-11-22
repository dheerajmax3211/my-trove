import {
  BellIcon,
  BentoCard,
  BentoGrid,
  Button,
  EmptyState,
  PageHeader,
  Skeleton,
  useToast,
} from '@platform/ui'
import { isApiError } from '@platform/api-client'
import { useState } from 'react'
import { useParams } from 'react-router-dom'
import { ModuleLink, useModuleNavigate } from '@platform/workspace-kit'
import { ConfirmDialog } from '../../../components/ConfirmDialog'
import { ErrorState } from '../../../components/ErrorState'
import { PageSkeleton } from '../../../components/PageSkeleton'
import { useClock } from '../../../lib/clock'
import { errorMessage } from '../../../lib/errors'
import { formatRelative, pluralize } from '../../../lib/format'
import { useDocumentTitle } from '../../../lib/useDocumentTitle'
import { AlertCard } from '../../alerts/components/AlertCard'
import { useReminders } from '../../reminders/hooks'
import { sortReminders } from '../../reminders/sort'
import { PowerChartSection } from '../../readings/components/PowerChartSection'
import { HealthStatusBadge } from '../components/HealthStatusBadge'
import { BaselineCard, HealthSummary } from '../components/HealthSummary'
import { ServicePanel } from '../components/ServicePanel'
import { useAppliance, useDeleteAppliance, useHealth, useRelearnBaseline } from '../hooks'
import { TYPE_LABELS } from '../types'

export function ApplianceDetailPage() {
  const { id = '' } = useParams()
  const navigate = useModuleNavigate()
  const clock = useClock()
  const { toast } = useToast()
  const appliance = useAppliance(id)
  const health = useHealth(id)
  const reminders = useReminders()
  const remove = useDeleteAppliance(id)
  const relearn = useRelearnBaseline(id)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [confirmRelearn, setConfirmRelearn] = useState(false)
  useDocumentTitle(appliance.data?.name ?? 'Appliance')

  if (appliance.isPending) return <PageSkeleton label="Loading appliance" />
  if (appliance.isError) {
    const missing = isApiError(appliance.error) && appliance.error.status === 404
    return missing ? (
      <EmptyState
        title="We could not find that appliance"
        description="It may have been deleted, or the link is wrong."
        action={
          <Button asChild>
            <ModuleLink to="/">Back to your appliances</ModuleLink>
          </Button>
        }
      />
    ) : (
      <ErrorState
        title="Could not load this appliance"
        error={appliance.error}
        onRetry={() => void appliance.refetch()}
      />
    )
  }

  const a = appliance.data
  const hasDevice = health.data ? health.data.status !== 'NO_DEVICE' : false
  const mine = sortReminders((reminders.data ?? []).filter((r) => r.applianceId === id))
  const alertList = health.data?.activeAlerts ?? []

  const onDelete = () =>
    remove.mutate(undefined, {
      onSuccess: () => {
        toast({
          title: 'Appliance deleted',
          description: `${a.name} and its history were removed.`,
          variant: 'success',
        })
        void navigate('/')
      },
    })

  return (
    <>
      <p className="hp-back-link">
        <ModuleLink to="/">All appliances</ModuleLink>
      </p>
      <PageHeader
        eyebrow={`${TYPE_LABELS[a.type]}${a.location ? `, ${a.location}` : ''}`}
        title={a.name}
        description={
          health.data ? (
            <span className="hp-inline-meta">
              <HealthStatusBadge status={health.data.status} />
              <span>
                {hasDevice
                  ? `Last reading ${formatRelative(health.data.lastReadingAt, clock()).toLowerCase()}`
                  : 'No device connected'}
              </span>
            </span>
          ) : undefined
        }
        actions={
          <>
            <Button variant="secondary" asChild>
              <ModuleLink to={`/appliances/${id}/edit`}>Edit</ModuleLink>
            </Button>
            <Button variant="danger" onClick={() => setConfirmDelete(true)}>
              Delete
            </Button>
          </>
        }
      />

      <BentoGrid>
        <PowerChartSection
          applianceId={id}
          hasDevice={hasDevice}
          loading={health.isPending}
          normalWatts={health.data?.baseline?.switching ? health.data.baseline.onLevelMedian : null}
          noDeviceAction={
            health.data ? (
              <Button asChild>
                <ModuleLink to={`/devices?appliance=${id}`}>Connect a device</ModuleLink>
              </Button>
            ) : undefined
          }
        />
        {health.isPending ? (
          <div className="hp-span-4" role="status" aria-busy="true" aria-label="Loading health">
            <Skeleton height="22rem" />
          </div>
        ) : health.isError ? (
          <div className="hp-span-4" />
        ) : (
          <HealthSummary health={health.data} onRelearn={() => setConfirmRelearn(true)} />
        )}
        {health.data ? <BaselineCard health={health.data} /> : null}
        <ServicePanel appliance={a} service={health.data?.service ?? null} reminders={mine} />
        <BentoCard span={12} title="Alerts for this appliance" icon={<BellIcon size={18} />}>
          {health.isError ? (
            <ErrorState
              headingAs="h3"
              title="Could not load alerts"
              error={health.error}
              onRetry={() => void health.refetch()}
            />
          ) : alertList.length === 0 ? (
            <p className="hp-muted">No active alerts. We will list anything unusual here.</p>
          ) : (
            <div className="hp-stack-3">
              <ul className="hp-alert-grid hp-plain-list" aria-label="Active alerts">
                {alertList.map((alert) => (
                  <li key={alert.id}>
                    <AlertCard alert={alert} showAppliance={false} headingAs="h3" />
                  </li>
                ))}
              </ul>
              <ModuleLink to={`/alerts?appliance=${id}&status=ALL`}>
                See all {pluralize(alertList.length, 'alert')} and history
              </ModuleLink>
            </div>
          )}
        </BentoCard>
      </BentoGrid>

      <ConfirmDialog
        open={confirmDelete}
        onOpenChange={(open) => {
          setConfirmDelete(open)
          if (!open) remove.reset()
        }}
        title={`Delete ${a.name}?`}
        description="This removes the appliance, its devices, alerts and history. It cannot be undone."
        confirmLabel="Delete appliance"
        busy={remove.isPending}
        error={remove.error ? errorMessage(remove.error) : null}
        onConfirm={onDelete}
      />
      <ConfirmDialog
        open={confirmRelearn}
        onOpenChange={(open) => {
          setConfirmRelearn(open)
          if (!open) relearn.reset()
        }}
        title="Relearn this appliance's normal?"
        description="The learned baseline is discarded and learning starts again from now, which takes about a week. Open alerts that were judged against the old baseline are closed."
        confirmLabel="Relearn baseline"
        busy={relearn.isPending}
        error={relearn.error ? errorMessage(relearn.error) : null}
        onConfirm={() =>
          relearn.mutate(undefined, {
            onSuccess: () => {
              toast({ title: 'Learning restarted', variant: 'success' })
              setConfirmRelearn(false)
            },
          })
        }
      />
    </>
  )
}
