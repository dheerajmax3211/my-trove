import { AuthClientError, type AuthClient, type AuthUser } from '@platform/auth-web'
import { DEMO_TOKEN_PREFIX } from '../mock/backend'
import type { DemoUserSeed } from '../mock/seed'

export interface DemoAuthClient extends AuthClient {
  /** Signs in as one of the demo users (also switches from another one). */
  signInAs: (uid: string) => Promise<void>
}

export interface DemoAuthOptions {
  users: readonly DemoUserSeed[]
  /** Start signed in as this user. Default: signed out. */
  initialUid?: string | null
  latencyMs?: number
}

const toAuthUser = (u: DemoUserSeed): AuthUser => ({
  uid: u.uid,
  email: u.email,
  displayName: u.displayName,
  photoURL: null,
  emailVerified: true,
})

/**
 * In-memory `AuthClient` with several switchable users. Tokens are `demo-token:<uid>`, which the
 * mock backend understands; real services would reject them, so this is for demo mode only.
 */
export function createDemoAuthClient({
  users,
  initialUid = null,
  latencyMs = 0,
}: DemoAuthOptions): DemoAuthClient {
  const find = (uid: string): DemoUserSeed => {
    const user = users.find((u) => u.uid === uid)
    if (!user) throw new AuthClientError('auth/user-not-found', `No demo user ${uid}`)
    return user
  }
  let current: AuthUser | null = initialUid ? toAuthUser(find(initialUid)) : null
  const listeners = new Set<(user: AuthUser | null) => void>()
  const emit = () => listeners.forEach((l) => l(current))
  const delay = () =>
    latencyMs > 0 ? new Promise<void>((r) => setTimeout(r, latencyMs)) : Promise.resolve()

  const signInAs = async (uid: string) => {
    const user = find(uid)
    await delay()
    current = toAuthUser(user)
    emit()
  }
  const unsupported = (): never => {
    throw new AuthClientError(
      'auth/operation-not-supported',
      'Email links are not available in demo mode. Pick a demo user instead.',
    )
  }

  return {
    onAuthStateChanged(next) {
      listeners.add(next)
      queueMicrotask(() => {
        if (listeners.has(next)) next(current)
      })
      return () => listeners.delete(next)
    },
    getIdToken: () => Promise.resolve(current ? `${DEMO_TOKEN_PREFIX}${current.uid}` : null),
    signInWithGoogle: () => signInAs(users[0]?.uid ?? ''),
    sendEmailLink: () => Promise.resolve(unsupported()),
    isEmailLink: () => false,
    completeEmailLinkSignIn: () => Promise.resolve(unsupported()),
    async signOut() {
      await delay()
      current = null
      emit()
    },
    signInAs,
  }
}
