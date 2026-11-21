import { describe, expect, it } from 'vitest'
import type { TimelineEntry } from '../../api/types'
import { describeEvent } from './events'

const entry = (
  eventType: string,
  detail: Record<string, unknown>,
  actorKind: TimelineEntry['actorKind'] = 'SYSTEM',
): TimelineEntry => ({
  seq: 1,
  at: '2026-01-01T00:00:00Z',
  actorKind,
  eventType,
  detail,
})

describe('describeEvent', () => {
  it('explains state changes with their reason', () => {
    expect(
      describeEvent(
        entry('STATE_CHANGED', { from: 'ACTIVE', to: 'GRACE', reason: 'check-in missed' }),
      ),
    ).toEqual({
      title: 'Switch state changed',
      summary: 'ACTIVE to GRACE (check-in missed)',
      actor: 'The scheduler',
    })
  })

  it('mentions voided approvals on a check-in and the vote on an approval', () => {
    expect(
      describeEvent(
        entry('CHECK_IN', { previousState: 'RELEASE_PENDING', approvalsInvalidated: 2 }, 'OWNER'),
      ).summary,
    ).toBe('from RELEASE_PENDING 2 approval(s) voided')
    expect(describeEvent(entry('APPROVAL_CAST', { decision: 'DECLINE' }, 'TRUSTEE')).summary).toBe(
      'declined',
    )
    expect(
      describeEvent(
        entry('ESCALATION_STEP_EXECUTED', { step: 0, urgency: 'NOTICE', audience: 'OWNER' }),
      ).summary,
    ).toBe('step 1, NOTICE to OWNER')
  })

  it('falls back to a readable name for unknown events', () => {
    expect(describeEvent(entry('SOMETHING_NEW', {})).title).toBe('something new')
  })
})
