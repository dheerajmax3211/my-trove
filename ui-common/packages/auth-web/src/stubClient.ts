import { AuthClientError, type AuthClient, type AuthUser } from './types'

export interface StubAuthClientOptions {
  /** Start signed in as this user. Default: signed out. */
  initialUser?: AuthUser | null
  /** The user that Google / email-link sign-in produces. */
  user?: AuthUser
  /** Simulated network latency in ms. Default 0. */
  latencyMs?: number
}

export const DEMO_USER: AuthUser = {
  uid: 'demo-user',
  email: 'demo@example.test',
  displayName: 'Demo User',
  photoURL: null,
  emailVerified: true,
}

export interface StubAuthClient extends AuthClient {
  /** How many tokens have been issued (a refresh issues a new one). Handy in demos/tests. */
  readonly issuedTokens: () => number
  /** Make the next `getIdToken()` hand out a token the API will reject (simulates expiry). */
  expireToken: () => void
}

/**
 * In-memory AuthClient for demos, the gallery and tests. Tokens look like `stub-token-N`;
 * `expireToken()` marks the current one as stale until `getIdToken(true)` refreshes it.
 */
export function createStubAuthClient(options: StubAuthClientOptions = {}): StubAuthClient {
  const { initialUser = null, user = DEMO_USER, latencyMs = 0 } = options
  let current: AuthUser | null = initialUser
  let counter = 1
  let stale = false
  const listeners = new Set<(user: AuthUser | null) => void>()
  let pendingEmail: string | null = null

  const delay = () =>
    latencyMs > 0 ? new Promise<void>((r) => setTimeout(r, latencyMs)) : Promise.resolve()
  const emit = () => listeners.forEach((l) => l(current))
  const signInAs = async () => {
    await delay()
    current = user
    emit()
  }

  return {
    onAuthStateChanged(next) {
      listeners.add(next)
      queueMicrotask(() => {
        if (listeners.has(next)) next(current)
      })
      return () => listeners.delete(next)
    },
    async getIdToken(forceRefresh = false) {
      await delay()
      if (!current) return null
      if (forceRefresh) {
        counter += 1
        stale = false
      }
      return stale ? `stub-token-${counter}-expired` : `stub-token-${counter}`
    },
    signInWithGoogle: signInAs,
    async sendEmailLink(email) {
      await delay()
      pendingEmail = email
    },
    isEmailLink: () => false,
    async completeEmailLinkSignIn(email) {
      if (!(email ?? pendingEmail))
        throw new AuthClientError('auth/email-required', 'Email required')
      await signInAs()
    },
    async signOut() {
      await delay()
      current = null
      emit()
    },
    issuedTokens: () => counter,
    expireToken: () => {
      stale = true
    },
  }
}
