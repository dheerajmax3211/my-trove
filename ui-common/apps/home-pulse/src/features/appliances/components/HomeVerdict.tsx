import {
  AlertIcon,
  BentoCard,
  BigStat,
  Button,
  CheckCircleIcon,
  cx,
  Skeleton,
  XCircleIcon,
} from '@platform/ui'
import { ModuleLink } from '@platform/workspace-kit'
import type { ReactNode } from 'react'
import { ErrorState } from '../../../components/ErrorState'
import { pluralize } from '../../../lib/format'
import { describeAlert } from '../../alerts/evidence'
import type { AlertDto } from '../../alerts/types'
import type { Slot } from './slot'

export type VerdictState = 'well' | 'attention' | 'critical'

export interface Verdict {
  state: VerdictState
  open: AlertDto[]
  acknowledged: number
  /** The alert to lead with: the most severe open one, newest first. */
  lead: AlertDto | null
}

const SEVERITY_RANK = { CRITICAL: 0, WARNING: 1, INFO: 2 } as const

/** Derives the home's state from its alerts. Only open alerts need attention; acknowledged ones are being watched. */
export function deriveVerdict(alerts: readonly AlertDto[]): Verdict {
  const open = alerts
    .filter((a) => a.status === 'OPEN')
    .sort(
      (a, b) =>
        SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity] ||
        b.openedAt.localeCompare(a.openedAt),
    )
  const acknowledged = alerts.filter((a) => a.status === 'ACKNOWLEDGED').length
  const lead = open[0] ?? null
  const state: VerdictState =
    open.length === 0
      ? 'well'
      : open.some((a) => a.severity === 'CRITICAL')
        ? 'critical'
        : 'attention'
  return { state, open, acknowledged, lead }
}

/**
 * A pulse trace across the foot of the card. Calm: a steady, even beat. Attention: the same beat with one spike.
 * It draws itself in once. Decorative; the headline carries the meaning.
 */
function PulseLine({ spike }: { spike: boolean }) {
  const beat = (x: number) => `L${x} 24 L${x + 6} 24 L${x + 10} 20 L${x + 14} 24`
  const flat = (x: number) => `L${x} 24`
  const d = spike
    ? `M0 24 ${flat(40)} ${beat(52)} ${flat(110)} ${beat(122)} ${flat(180)} L196 24 L202 4 L210 42 L216 24 ${flat(250)} ${beat(262)} ${flat(320)} L480 24`
    : `M0 24 ${flat(40)} ${beat(52)} ${flat(110)} ${beat(122)} ${flat(180)} ${beat(192)} ${flat(250)} ${beat(262)} ${flat(320)} ${beat(332)} L480 24`
  return (
    <svg
      className="hp-pulse-line"
      viewBox="0 0 480 48"
      preserveAspectRatio="none"
      aria-hidden="true"
      focusable="false"
    >
      <path d={d} pathLength={1} />
    </svg>
  )
}

export interface HomeVerdictProps extends Slot {
  alerts: readonly AlertDto[] | undefined
  loading: boolean
  error: unknown
  applianceCount: number
  onRetry: () => void
}

/** The first thing on the home, and its one black card: a calm "all well" or a clear "this needs attention". */
export function HomeVerdict({
  alerts,
  loading,
  error,
  applianceCount,
  onRetry,
  className,
  style,
}: HomeVerdictProps) {
  if (loading) {
    return (
      <div
        role="status"
        aria-busy="true"
        aria-label="Checking for alerts"
        className={cx('hp-span-7', className)}
        {...(style ? { style } : {})}
      >
        <Skeleton height="20rem" />
      </div>
    )
  }
  if (error || !alerts) {
    return (
      <div className={cx('hp-span-7', className)} {...(style ? { style } : {})}>
        <ErrorState title="Could not check your alerts" error={error} onRetry={onRetry} />
      </div>
    )
  }

  const verdict = deriveVerdict(alerts)
  const { state, open, acknowledged, lead } = verdict
  const appliances = pluralize(applianceCount, 'appliance')

  let icon: ReactNode
  let title: string
  let body: ReactNode
  let delta: string
  let actions: ReactNode = null

  if (state === 'well' || !lead) {
    icon = <CheckCircleIcon size={20} />
    title = 'Everything is running normally'
    delta = 'All clear'
    body =
      acknowledged > 0
        ? `No new alerts across your ${appliances}. ${pluralize(acknowledged, 'acknowledged alert')} still on watch, and it clears by itself once things are back to normal.`
        : `No appliance has drifted from its normal power draw. Home Pulse is watching your ${appliances}.`
    if (acknowledged > 0)
      actions = (
        <Button variant="secondary" asChild>
          <ModuleLink to="/alerts?status=ACKNOWLEDGED">See acknowledged</ModuleLink>
        </Button>
      )
  } else {
    const critical = state === 'critical'
    icon = critical ? <XCircleIcon size={20} /> : <AlertIcon size={20} />
    delta = critical ? 'Needs you now' : 'Worth a look'
    title =
      open.length === 1
        ? `${lead.applianceName} needs attention`
        : `${pluralize(open.length, 'alert')} need your attention`
    body = (
      <>
        {describeAlert(lead).headline}
        {open.length === 1
          ? ''
          : ` ${open.length - 1 === 1 ? 'One other alert is' : `${open.length - 1} other alerts are`} open.`}
      </>
    )
    actions = (
      <>
        <Button asChild>
          <ModuleLink to="/alerts">Review {open.length === 1 ? 'the alert' : 'alerts'}</ModuleLink>
        </Button>
        <Button variant="secondary" asChild>
          <ModuleLink to={`/appliances/${lead.applianceId}`}>Open {lead.applianceName}</ModuleLink>
        </Button>
      </>
    )
  }

  return (
    <BentoCard
      tone="dark"
      span={7}
      title={title}
      icon={icon}
      data-state={state}
      aria-live="polite"
      className={cx('hp-verdict-card', className)}
      {...(style ? { style } : {})}
    >
      <BigStat
        value={open.length}
        unit={open.length === 1 ? 'open alert' : 'open alerts'}
        delta={delta}
        trend={state === 'well' ? 'up' : 'down'}
        caption={body}
      />
      {actions ? <div className="hp-button-row hp-verdict-actions">{actions}</div> : null}
      <PulseLine spike={state !== 'well'} />
    </BentoCard>
  )
}
