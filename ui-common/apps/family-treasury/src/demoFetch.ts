import { MockBackend } from './mock/mockBackend'
import { DEMO_VIEWER_UID, seedDemo } from './mock/seed'

/**
 * The in-memory family-treasury API for the workspace's demo mode: the same mock the standalone demo and every test
 * use, seeded with the Okafor household. The workspace signs in its own stub user, so every request is pinned to the
 * demo household's owner before it reaches the mock (which reads `Authorization: Bearer demo:<uid>`). Nothing here
 * touches the network.
 */
export function createDemoFetch(): typeof fetch {
  const backend = new MockBackend({ latencyMs: 150 })
  seedDemo(backend)
  return (input, init) => {
    const headers = new Headers(init?.headers)
    headers.set('authorization', `Bearer demo:${DEMO_VIEWER_UID}`)
    return backend.fetch(input, { ...init, headers })
  }
}
