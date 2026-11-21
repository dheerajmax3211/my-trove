import { createMockBackend, DEMO_TOKEN_PREFIX } from '../mock/backend'
import { WORKSPACE_DEMO_USERS } from '../mock/seed'
import { setDemoTransport } from './demoTransport'

/** The one person the workspace's demo mode signs in. The seed gives them the household. */
const DEMO_UID = WORKSPACE_DEMO_USERS[0]?.uid ?? 'demo-user'

/**
 * An in-memory shared-service for the workspace's demo mode. The workspace's stub sign-in issues tokens like
 * `stub-token-1`; the mock backend identifies callers by `demo-token:<uid>`, so any other bearer token is read
 * as the demo user. It never touches the network.
 */
export function createCoreDemoFetch(): typeof fetch {
  const backend = createMockBackend({ users: WORKSPACE_DEMO_USERS, seed: 'demo' })
  const demoFetch: typeof fetch = (input, init) => {
    const headers = new Headers(init?.headers)
    const token = headers.get('authorization')?.replace(/^Bearer /, '')
    if (token && !token.startsWith(DEMO_TOKEN_PREFIX)) {
      headers.set('authorization', `Bearer ${DEMO_TOKEN_PREFIX}${DEMO_UID}`)
      return backend.fetch(input, { ...init, headers })
    }
    return backend.fetch(input, init)
  }
  setDemoTransport(demoFetch)
  return demoFetch
}
