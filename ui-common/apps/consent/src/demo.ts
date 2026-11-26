import { createMockBackend } from './mock/backend'

/**
 * A fresh in-memory Consent gateway for the workspace's demo mode: the seeded vault, apps, pending
 * requests and history the tests also use, answering at `<gateway>/api/consent/v1/owner/...`.
 *
 * The mock refuses calls without a bearer token (as the real gateway does). The
 * workspace's demo identity may not attach one, so a missing token is filled in here: in demo mode every
 * visitor is the demo owner.
 */
export function createConsentDemoFetch(): typeof fetch {
  const backend = createMockBackend({ seed: 'demo', latencyMs: 120 })
  return (input, init) => {
    const headers = new Headers(init?.headers ?? (input instanceof Request ? input.headers : {}))
    if (!headers.has('authorization')) headers.set('authorization', 'Bearer demo')
    return backend.fetch(input, { ...init, headers })
  }
}
