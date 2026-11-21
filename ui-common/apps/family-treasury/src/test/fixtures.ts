import { createApiClient } from '@platform/api-client'
import { createTreasuryApi } from '../api/treasuryApi'
import { MockBackend } from '../mock/mockBackend'
import { DEMO_HOUSEHOLD, seedDemo } from '../mock/seed'

/** 2026-11-18 12:00 UTC: all seeded dates are relative to this, so tests are deterministic. */
export const FIXED_NOW = new Date('2026-11-18T12:00:00Z')

export interface Clock {
  current: Date
  now: () => Date
}

export function fixedClock(start: Date = FIXED_NOW): Clock {
  const clock: Clock = { current: start, now: () => clock.current }
  return clock
}

export function seededBackend(clock: Clock = fixedClock()) {
  const backend = new MockBackend({ now: clock.now })
  seedDemo(backend)
  const household = backend.householdByName(DEMO_HOUSEHOLD)
  return { backend, household, clock }
}

/** A typed API client for `uid` talking straight to the mock, with no UI. */
export function apiFor(backend: MockBackend, uid: string) {
  const client = createApiClient({
    baseUrl: '/api/v1',
    getToken: () => `demo:${uid}`,
    fetch: backend.fetch,
  })
  return createTreasuryApi(client)
}
