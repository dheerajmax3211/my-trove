import type { StateView } from '../../api/types'
import { formatDateTime } from '../../lib/format'

export interface StatusSummary {
  headline: string
  detail: string
  /** What the countdown counts down to, e.g. "Next check-in due in". */
  countdownLabel: string | null
  countdownTarget: string | null
  tone: 'success' | 'info' | 'warning' | 'danger' | 'neutral'
}

/** Plain-language reading of the switch, one place so the wording is consistent and testable. */
export function summarize(s: StateView): StatusSummary {
  const approvals = `${s.quorum.approved} of ${s.quorum.required} trustees have approved`
  if (!s.armed && s.state === 'ACTIVE')
    return {
      headline: 'Not armed',
      detail:
        'The switch is off. Nothing will happen to your vault until you arm it, and nobody is notified.',
      countdownLabel: null,
      countdownTarget: null,
      tone: 'neutral',
    }
  switch (s.state) {
    case 'ACTIVE':
      return s.pausedUntil
        ? {
            headline: 'Paused for vacation',
            detail: 'Timers are on hold. Check in or resume to end the pause early.',
            countdownLabel: 'Pause ends in',
            countdownTarget: s.pausedUntil,
            tone: 'info',
          }
        : {
            headline: 'All quiet',
            detail: 'You are checked in. Tap "I\'m here" any time to push the deadline back.',
            countdownLabel: 'Next check-in due in',
            countdownTarget: s.nextDueAt,
            tone: 'success',
          }
    case 'GRACE':
      return {
        headline: 'Check-in missed',
        detail:
          'You are in the grace period. Nobody has been contacted about the vault yet. Check in now and everything resets.',
        countdownLabel: 'Reminders begin in',
        countdownTarget: s.nextActionAt,
        tone: 'warning',
      }
    case 'ESCALATING':
      return {
        headline: 'Reminders are going out',
        detail: `Step ${s.escalation.stepsExecuted} of ${s.escalation.totalSteps} has been sent. Check in now to stop them. After the last reminder your trustees are asked to approve release.`,
        countdownLabel:
          s.escalation.stepsExecuted < s.escalation.totalSteps
            ? 'Next reminder in'
            : 'Trustees are asked to vote in',
        countdownTarget: s.nextActionAt,
        tone: 'warning',
      }
    case 'RELEASE_PENDING':
      return s.quorum.quorumReachedAt
        ? {
            headline: 'Release approved, cooling off',
            detail: `${approvals}. The vault is released when the cool-off ends, unless you check in before then.`,
            countdownLabel: 'Earliest release in',
            countdownTarget: s.quorum.releaseNotBefore,
            tone: 'danger',
          }
        : {
            headline: 'Waiting for your trustees',
            detail: `${approvals}. Nothing is released until enough of them approve and the cool-off passes. Check in now to cancel this.`,
            countdownLabel: null,
            countdownTarget: null,
            tone: 'danger',
          }
    case 'RELEASED':
      return {
        headline: 'Released',
        detail: `Your trustees were given access${s.releasedAt ? ` on ${formatDateTime(s.releasedAt)}` : ''}.`,
        countdownLabel: null,
        countdownTarget: null,
        tone: 'danger',
      }
  }
}
