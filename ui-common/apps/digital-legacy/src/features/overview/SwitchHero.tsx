import { useApiMutation } from '@platform/api-client'
import { BentoCard, Badge, Button, KeyIcon, useToast, type BadgeVariant } from '@platform/ui'
import type { CSSProperties } from 'react'
import { ownerPaths } from '../../api/paths'
import type { StateView, SwitchStateName } from '../../api/types'
import { CountdownRing } from '../../components/CountdownRing'
import { ErrorNotice } from '../../components/ErrorNotice'
import { formatDateTime } from '../../lib/format'
import { OWNER_KEYS } from '../queries'
import { ringTotalSeconds, summarize } from './status'

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

/**
 * The black card the page opens with: what state the switch is in, a ring that drains toward the next deadline, and
 * the one action that matters ("I'm here").
 */
export function SwitchHero({
  state,
  refreshing,
  onRefresh,
  className,
  style,
}: {
  state: StateView
  refreshing: boolean
  onRefresh: () => void
  className?: string
  style?: CSSProperties
}) {
  const { toast } = useToast()
  const status = summarize(state)
  const released = state.state === 'RELEASED'
  const checkIn = useApiMutation<StateView>({
    path: ownerPaths.checkIn,
    invalidate: OWNER_KEYS,
    onSuccess: (next) =>
      toast({
        title: 'Checked in',
        description: next.armed
          ? `Your next check-in is due ${formatDateTime(next.nextDueAt)}.`
          : 'The switch is not armed yet, so this is just recorded.',
        variant: 'success',
      }),
  })

  return (
    <BentoCard
      tone="dark"
      span={8}
      title="Your switch"
      icon={<KeyIcon size={18} />}
      data-tone={status.tone}
      className={className ? `dl-hero ${className}` : 'dl-hero'}
      {...(style ? { style } : {})}
      actions={
        <span className="row-wrap">
          <Badge variant={BADGE[status.tone]} dot>
            {STATE_LABEL[state.state]}
          </Badge>
          <Badge variant={state.armed ? 'accent' : 'neutral'}>
            {state.armed ? 'Armed' : 'Not armed'}
          </Badge>
        </span>
      }
    >
      <div className="switch-hero-grid">
        <div className="switch-hero-body">
          <h1 id="switch-title" className="switch-hero-title">
            {status.headline}
          </h1>
          <p className="switch-hero-detail">{status.detail}</p>
          <div className="switch-actions">
            <Button
              size="lg"
              className="checkin-button"
              disabled={released}
              loading={checkIn.isPending}
              onClick={() => checkIn.mutate()}
            >
              I&apos;m here
            </Button>
            <Button variant="ghost" loading={refreshing} onClick={onRefresh}>
              Refresh status
            </Button>
          </div>
          {checkIn.error ? <ErrorNotice error={checkIn.error} title="Could not check in" /> : null}
          <p className="switch-hero-note" role={released ? 'status' : undefined}>
            {released
              ? 'The vault has been released to your trustees. A check-in can no longer undo it.'
              : 'One tap tells the switch you are fine. It resets every timer and voids any trustee approvals.'}
          </p>
        </div>
        {status.countdownLabel && status.countdownTarget ? (
          <div className="switch-clock">
            <CountdownRing
              target={status.countdownTarget}
              totalSeconds={ringTotalSeconds(state)}
              label={status.countdownLabel}
            />
            <span className="switch-clock-date">{formatDateTime(status.countdownTarget)}</span>
          </div>
        ) : null}
      </div>
    </BentoCard>
  )
}
