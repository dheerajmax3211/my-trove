import { AuthClientError, type AuthClient, type AuthUser } from '@platform/auth-web'
import type { Persona } from '../mock/seed'

export interface DemoAuthClient extends AuthClient {
  /** Sign in as (or switch to) one of the demo personas. */
  switchTo: (uid: string) => void
}

const toUser = (p: Persona): AuthUser => ({
  uid: p.uid,
  email: p.email,
  displayName: p.name,
  photoURL: null,
  emailVerified: true,
})

/**
 * In-memory AuthClient for demo mode: signing in means picking a persona. Its ID token is `demo:<uid>`, which the
 * mock backend reads to know who is calling, so one browser can play several household members in turn.
 */
export function createDemoAuthClient(
  personas: readonly Persona[],
  initialUid: string | null = null,
): DemoAuthClient {
  const find = (uid: string | null) => personas.find((p) => p.uid === uid) ?? null
  let current: AuthUser | null = find(initialUid) ? toUser(find(initialUid)!) : null
  const listeners = new Set<(user: AuthUser | null) => void>()
  const emit = () => listeners.forEach((l) => l(current))

  return {
    onAuthStateChanged(next) {
      listeners.add(next)
      queueMicrotask(() => {
        if (listeners.has(next)) next(current)
      })
      return () => listeners.delete(next)
    },
    getIdToken: () => Promise.resolve(current ? `demo:${current.uid}` : null),
    signInWithGoogle() {
      const first = personas[0]
      if (first) {
        current = toUser(first)
        emit()
      }
      return Promise.resolve()
    },
    sendEmailLink: () => Promise.resolve(),
    isEmailLink: () => false,
    completeEmailLinkSignIn: () =>
      Promise.reject(
        new AuthClientError('auth/email-required', 'Email links are not used in demo mode'),
      ),
    signOut() {
      current = null
      emit()
      return Promise.resolve()
    },
    switchTo(uid) {
      const persona = find(uid)
      if (!persona) return
      current = toUser(persona)
      emit()
    },
  }
}
