import type { SwitchPolicy } from '../api/types'
import { DAY } from './format'

/** A sensible starting policy: weekly check-in, three days of grace, a week of escalating reminders. */
export function defaultPolicy(ownerEmail = ''): SwitchPolicy {
  return {
    checkInIntervalSeconds: 7 * DAY,
    graceSeconds: 3 * DAY,
    escalationDurationSeconds: 7 * DAY,
    steps: [
      { offsetSeconds: 0, urgency: 'NOTICE', audience: 'OWNER', channels: ['PUSH', 'EMAIL'] },
      { offsetSeconds: DAY, urgency: 'WARNING', audience: 'OWNER', channels: ['EMAIL', 'SMS'] },
      { offsetSeconds: 3 * DAY, urgency: 'URGENT', audience: 'ALL', channels: ['SMS', 'EMAIL'] },
      { offsetSeconds: 6 * DAY, urgency: 'FINAL', audience: 'ALL', channels: ['SMS', 'EMAIL'] },
    ],
    coolOffSeconds: 3 * DAY,
    quorum: 2,
    maxPauseSeconds: 30 * DAY,
    ownerContacts: [{ channel: 'EMAIL', address: ownerEmail }],
  }
}
