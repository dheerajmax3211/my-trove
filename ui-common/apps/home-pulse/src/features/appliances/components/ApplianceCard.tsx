import { Button, Card, CardContent, CardHeader, CardTitle, Skeleton } from '@platform/ui'
import { Link } from 'react-router-dom'
import { useClock } from '../../../lib/clock'
import { errorMessage } from '../../../lib/errors'
import { formatRelative, formatWatts, pluralize } from '../../../lib/format'
import { useCurrentDraw } from '../../readings/hooks'
import { useHealth } from '../hooks'
import { TYPE_LABELS, type Appliance } from '../types'
import { HealthStatusBadge } from './HealthStatusBadge'

/** One appliance on the home overview: status, current draw, last seen and open alerts. */
export function ApplianceCard({ appliance }: { appliance: Appliance }) {
  const clock = useClock()
  const health = useHealth(appliance.id)
  const hasDevice = health.data ? health.data.status !== 'NO_DEVICE' : false
  const draw = useCurrentDraw(appliance.id, hasDevice)

  const open = health.data?.activeAlerts.filter((a) => a.status === 'OPEN').length ?? 0
  const acknowledged =
    health.data?.activeAlerts.filter((a) => a.status === 'ACKNOWLEDGED').length ?? 0

  let currentDraw = <Skeleton width="4rem" height="1.25rem" />
  if (health.data && !hasDevice) currentDraw = <span className="muted">No device</span>
  else if (draw.data) currentDraw = <strong>{formatWatts(draw.data.watts)}</strong>
  else if (draw.isSuccess) currentDraw = <span className="muted">No recent reading</span>
  else if (draw.isError) currentDraw = <span className="muted">Unavailable</span>

  return (
    <Card interactive className="link-card">
      <CardHeader>
        <div className="card-title-row">
          <CardTitle as="h2">
            <Link to={`/appliances/${appliance.id}`} className="stretched-link">
              {appliance.name}
            </Link>
          </CardTitle>
          {health.data ? <HealthStatusBadge status={health.data.status} /> : null}
        </div>
        <p className="muted small">
          {TYPE_LABELS[appliance.type]}
          {appliance.location ? `, ${appliance.location}` : ''}
        </p>
      </CardHeader>
      <CardContent>
        {health.isError ? (
          <div className="stack-2">
            <p className="small">{errorMessage(health.error)}</p>
            <Button
              size="sm"
              variant="secondary"
              className="above-link"
              onClick={() => void health.refetch()}
            >
              Retry
            </Button>
          </div>
        ) : (
          <dl className="facts">
            <div>
              <dt>Current draw</dt>
              <dd>{currentDraw}</dd>
            </div>
            <div>
              <dt>Last seen</dt>
              <dd>
                {health.data ? (
                  hasDevice ? (
                    formatRelative(health.data.lastReadingAt, clock())
                  ) : (
                    <span className="muted">Never</span>
                  )
                ) : (
                  <Skeleton width="5rem" height="1.25rem" />
                )}
              </dd>
            </div>
            <div>
              <dt>Open alerts</dt>
              <dd>
                {health.data ? (
                  <>
                    <strong>{open}</strong>
                    {acknowledged > 0 ? (
                      <span className="muted small">
                        {' '}
                        (+{pluralize(acknowledged, 'acknowledged')})
                      </span>
                    ) : null}
                  </>
                ) : (
                  <Skeleton width="2rem" height="1.25rem" />
                )}
              </dd>
            </div>
          </dl>
        )}
      </CardContent>
    </Card>
  )
}
