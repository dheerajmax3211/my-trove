import { Button, EmptyState, PageHeader, Select, Field, Skeleton } from '@platform/ui'
import { Link, useSearchParams } from 'react-router-dom'
import { ErrorState } from '../../../components/ErrorState'
import { pluralize } from '../../../lib/format'
import { useDocumentTitle } from '../../../lib/useDocumentTitle'
import { useAppliances } from '../../appliances/hooks'
import { AlertCard } from '../components/AlertCard'
import { useAlerts } from '../hooks'
import { ALERT_FILTERS, type AlertFilter } from '../types'

const isFilter = (value: string | null): value is AlertFilter =>
  ALERT_FILTERS.some((f) => f.value === value)

const EMPTY_COPY: Record<AlertFilter, { title: string; description: string }> = {
  ACTIVE: {
    title: 'Nothing needs your attention',
    description:
      'No appliance is showing an anomaly right now. We will tell you here when one does.',
  },
  OPEN: {
    title: 'No open alerts',
    description: 'Everything that was raised has been acknowledged or has cleared.',
  },
  ACKNOWLEDGED: {
    title: 'No acknowledged alerts',
    description: 'Alerts you acknowledge stay here until they clear.',
  },
  RESOLVED: {
    title: 'No resolved alerts',
    description: 'Alerts that clear on their own are kept here as history.',
  },
  ALL: {
    title: 'No alerts yet',
    description: 'When an appliance drifts from its normal pattern, the alert shows up here.',
  },
}

export function AlertsPage() {
  useDocumentTitle('Alerts')
  const [params, setParams] = useSearchParams()
  const statusParam = params.get('status')
  const filter: AlertFilter = isFilter(statusParam) ? statusParam : 'ACTIVE'
  const applianceId = params.get('appliance') ?? undefined

  const alerts = useAlerts(filter, applianceId)
  const appliances = useAppliances()
  const applianceName = appliances.data?.find((a) => a.id === applianceId)?.name

  const update = (next: { status?: AlertFilter; appliance?: string | null }) => {
    const merged = new URLSearchParams(params)
    if (next.status !== undefined) {
      if (next.status === 'ACTIVE') merged.delete('status')
      else merged.set('status', next.status)
    }
    if (next.appliance !== undefined) {
      if (next.appliance) merged.set('appliance', next.appliance)
      else merged.delete('appliance')
    }
    setParams(merged, { replace: true })
  }

  return (
    <>
      <PageHeader
        title="Alerts"
        description="Changes in how your appliances use power, explained in plain words."
        actions={
          <Field label="Show" className="inline-field">
            <Select
              size="sm"
              value={filter}
              onChange={(e) => update({ status: e.target.value as AlertFilter })}
            >
              {ALERT_FILTERS.map((f) => (
                <option key={f.value} value={f.value}>
                  {f.label}
                </option>
              ))}
            </Select>
          </Field>
        }
      />
      {applianceId ? (
        <p className="filter-chip">
          Showing alerts for <strong>{applianceName ?? 'one appliance'}</strong>.{' '}
          <Button variant="ghost" size="sm" onClick={() => update({ appliance: null })}>
            Show all appliances
          </Button>
        </p>
      ) : null}
      {alerts.isPending ? (
        <div className="stack-3" role="status" aria-busy="true" aria-label="Loading alerts">
          <Skeleton height="9rem" />
          <Skeleton height="9rem" />
        </div>
      ) : alerts.isError ? (
        <ErrorState
          title="Could not load alerts"
          error={alerts.error}
          onRetry={() => void alerts.refetch()}
        />
      ) : alerts.data.length === 0 ? (
        <EmptyState
          title={EMPTY_COPY[filter].title}
          description={EMPTY_COPY[filter].description}
          action={
            <Button variant="secondary" asChild>
              <Link to="/">Back to your appliances</Link>
            </Button>
          }
        />
      ) : (
        <>
          <p className="muted small" role="status">
            {pluralize(alerts.data.length, 'alert')}
          </p>
          <ul className="stack-3 plain-list" aria-label="Alerts">
            {alerts.data.map((alert) => (
              <li key={alert.id}>
                <AlertCard alert={alert} />
              </li>
            ))}
          </ul>
        </>
      )}
    </>
  )
}
