import { Badge, Card, CardContent, CardHeader, CardTitle, type BadgeVariant } from '@platform/ui'
import type { StateView, SwitchStateName } from '../../api/types'
import { Countdown } from '../../components/Countdown'
import { formatDateTime } from '../../lib/format'
import { summarize } from './status'

const STATE_LABEL: Record<SwitchStateName, string> = {
  ACTIVE: 'Active',
  GRACE: 'Grace',
  ESCALATING: 'Escalating',
  RELEASE_PENDING: 'Release pending',
  RELEASED: 'Released',
}

const BADGE: Record<ReturnType<typeof summarize>['tone'], BadgeVariant> = {
  success: 'success',
  info: 'info',
  warning: 'warning',
  danger: 'danger',
  neutral: 'neutral',
}

export function StatusPanel({ state }: { state: StateView }) {
  const status = summarize(state)
  return (
    <Card variant="elevated" aria-labelledby="status-title">
      <CardHeader>
        <div className="row-wrap">
          <CardTitle as="h2" id="status-title">
            {status.headline}
          </CardTitle>
          <Badge variant={BADGE[status.tone]} dot>
            {STATE_LABEL[state.state]}
          </Badge>
          <Badge variant={state.armed ? 'accent' : 'neutral'}>
            {state.armed ? 'Armed' : 'Not armed'}
          </Badge>
        </div>
      </CardHeader>
      <CardContent>
        <div className="status-hero">
          <p style={{ margin: 0 }}>{status.detail}</p>
          {status.countdownLabel && status.countdownTarget ? (
            <div>
              <div className="muted small">{status.countdownLabel}</div>
              <Countdown target={status.countdownTarget} className="status-countdown" />
            </div>
          ) : null}
          <dl className="status-grid">
            <div>
              <dt>Last check-in</dt>
              <dd>{formatDateTime(state.lastCheckInAt)}</dd>
            </div>
            <div>
              <dt>Next deadline</dt>
              <dd>{state.armed ? formatDateTime(state.nextDueAt) : 'not armed'}</dd>
            </div>
            <div>
              <dt>Trustee approvals</dt>
              <dd>
                {state.quorum.approved} of {state.quorum.required}
              </dd>
            </div>
            <div>
              <dt>Trustees with a share</dt>
              <dd>
                {state.quorum.trusteesHoldingShare} of {state.quorum.trusteesActive}
              </dd>
            </div>
          </dl>
        </div>
      </CardContent>
    </Card>
  )
}
