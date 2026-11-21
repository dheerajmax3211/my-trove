import { useApiMutation } from '@platform/api-client'
import { Badge, Button, KeyCut, VaultRings, useToast, type BadgeVariant } from '@platform/ui'
import { ownerPaths } from '../../api/paths'
import type { StateView, SwitchStateName } from '../../api/types'
import { Countdown } from '../../components/Countdown'
import { ErrorNotice } from '../../components/ErrorNotice'
import { formatDateTime } from '../../lib/format'
import { OWNER_KEYS } from '../queries'
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

/**
 * The first thing on the page: what state the switch is in, when the next check-in is due, and the one
 * action that matters ("I'm here"). It is the vault surface of this product, with the dial behind it.
 */
export function SwitchHero({
  state,
  refreshing,
  onRefresh,
}: {
  state: StateView
  refreshing: boolean
  onRefresh: () => void
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
    <section
      className="switch-hero pp-grain"
      data-surface="vault"
      data-tone={status.tone}
      aria-labelledby="switch-title"
    >
      <VaultRings animate className="switch-hero-rings" />
      <div className="switch-hero-body">
        <div className="row-wrap">
          <Badge variant={BADGE[status.tone]} dot>
            {STATE_LABEL[state.state]}
          </Badge>
          <Badge variant={state.armed ? 'accent' : 'neutral'}>
            {state.armed ? 'Armed' : 'Not armed'}
          </Badge>
        </div>
        <h1 id="switch-title" className="switch-hero-title">
          {status.headline}
        </h1>
        <p className="switch-hero-detail">{status.detail}</p>
        {status.countdownLabel && status.countdownTarget ? (
          <div className="switch-clock">
            <span className="switch-clock-label">{status.countdownLabel}</span>
            <Countdown target={status.countdownTarget} className="switch-clock-time" />
            <span className="switch-clock-date">{formatDateTime(status.countdownTarget)}</span>
          </div>
        ) : null}
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
      <KeyCut className="switch-hero-keycut" height={20} />
    </section>
  )
}
