import type { Audience, SwitchPolicy, Urgency } from '../../api/types'

export type SegmentKind = 'quiet' | 'grace' | 'escalation' | 'vote'

export interface PreviewSegment {
  kind: SegmentKind
  label: string
  startSeconds: number
  endSeconds: number
  description: string
}

export interface PreviewStep {
  atSeconds: number
  urgency: Urgency
  audience: Audience
}

export interface TimelinePreview {
  segments: PreviewSegment[]
  steps: PreviewStep[]
  /** The soonest the vault could be released after a check-in, if trustees approve instantly. */
  earliestReleaseSeconds: number
}

/**
 * Lays the policy out on one line, measured from the moment of your last check-in. Pure and
 * synchronous so the preview can follow every keystroke.
 */
export function buildPreview(policy: SwitchPolicy): TimelinePreview {
  const quietEnd = policy.checkInIntervalSeconds
  const graceEnd = quietEnd + policy.graceSeconds
  const escalationEnd = graceEnd + policy.escalationDurationSeconds
  const voteEnd = escalationEnd + policy.coolOffSeconds
  return {
    segments: [
      {
        kind: 'quiet',
        label: 'Quiet',
        startSeconds: 0,
        endSeconds: quietEnd,
        description: 'Nothing happens. A check-in at any point restarts this period.',
      },
      {
        kind: 'grace',
        label: 'Grace',
        startSeconds: quietEnd,
        endSeconds: graceEnd,
        description:
          'Check-in missed. Nobody is contacted yet; a check-in simply restarts everything.',
      },
      {
        kind: 'escalation',
        label: 'Reminders',
        startSeconds: graceEnd,
        endSeconds: escalationEnd,
        description: 'Reminders go out on your schedule, rising in urgency.',
      },
      {
        kind: 'vote',
        label: 'Approval and cool-off',
        startSeconds: escalationEnd,
        endSeconds: voteEnd,
        description: `Trustees are asked to approve. Once ${policy.quorum} approve, the cool-off runs and one check-in from you still cancels it.`,
      },
    ],
    steps: policy.steps.map((s) => ({
      atSeconds: graceEnd + s.offsetSeconds,
      urgency: s.urgency,
      audience: s.audience,
    })),
    earliestReleaseSeconds: voteEnd,
  }
}
