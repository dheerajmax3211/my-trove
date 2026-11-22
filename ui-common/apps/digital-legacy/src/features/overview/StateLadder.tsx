import { BentoCard, HourglassIcon, Stepper, type StepperStep } from '@platform/ui'
import type { CSSProperties } from 'react'
import type { StateView } from '../../api/types'
import { formatDuration } from '../../lib/format'
import { ladderIndex } from './status'

/** The five rungs, with what each one means in this owner's own numbers when a policy exists. */
export function ladderSteps(state: StateView): StepperStep[] {
  const p = state.policy
  const trustees = state.quorum.trusteesActive
  return [
    {
      id: 'active',
      label: 'You check in',
      description: p
        ? `You tap "I'm here" at least every ${formatDuration(p.checkInIntervalSeconds)}.`
        : 'You tap "I\'m here" on a regular rhythm that you choose.',
    },
    {
      id: 'grace',
      label: 'Grace period',
      description: p
        ? `${formatDuration(p.graceSeconds)} to check in late. Nobody is contacted yet.`
        : 'A stretch to check in late. Nobody is contacted yet.',
    },
    {
      id: 'reminders',
      label: 'Reminders',
      description: p
        ? `${p.steps.length} ${p.steps.length === 1 ? 'reminder' : 'reminders'} over ${formatDuration(p.escalationDurationSeconds)}, to you first.`
        : 'Reminders go to you first, then to your trustees.',
    },
    {
      id: 'vote',
      label: 'Trustees decide',
      description: p
        ? `${p.quorum} of your ${trustees} ${trustees === 1 ? 'trustee' : 'trustees'} must approve.`
        : 'Enough trustees must approve. One alone cannot.',
    },
    {
      id: 'released',
      label: 'Vault released',
      description: p
        ? `After a ${formatDuration(p.coolOffSeconds)} cool-off, trustees can open it together.`
        : 'After a cool-off, trustees can open it together.',
    },
  ]
}

/** Where the switch is on the way from "all quiet" to "released". A check-in at any rung before the last goes back to the start. */
export function StateLadder({
  state,
  className,
  style,
}: {
  state: StateView
  className?: string
  style?: CSSProperties
}) {
  const here = state.armed || state.state !== 'ACTIVE' ? ladderIndex(state.state) : -1
  return (
    <BentoCard
      span={12}
      title="What happens if you go quiet"
      icon={<HourglassIcon size={18} />}
      className={className ? `ladder ${className}` : 'ladder'}
      {...(style ? { style } : {})}
    >
      <p className="section-lead">
        Each rung is a chance to stop it. Until the last one, a single check-in puts everything back
        to the start.
      </p>
      <Stepper
        label="From checked in to released"
        steps={ladderSteps(state)}
        current={Math.max(here, 0)}
        statusLabels={{ complete: 'Passed', current: 'You are here', upcoming: 'Not reached' }}
        className="ladder-steps"
      />
      {here === -1 ? (
        <p className="small muted">
          The switch is not armed, so nothing on this ladder will happen. It starts at the first
          rung once you arm it.
        </p>
      ) : null}
    </BentoCard>
  )
}
