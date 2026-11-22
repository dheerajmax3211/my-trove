import { AuthClientError, type AuthClient } from './types'

export const UNCONFIGURED_MESSAGE =
  'Sign-in is not set up in this build. Start the dev stack (dev/web.sh sets VITE_DEV_IDP_URL), or set the VITE_FIREBASE_* values. To look around without an account, use the demo.'

/**
 * The AuthClient for a build with no sign-in configured. It never signs anyone in, so a missing setting shows as a
 * clear error on the sign-in page rather than a silent drop into demo data. Demo is only ever chosen by `?demo=1`.
 */
export function createUnconfiguredAuthClient(): AuthClient {
  const refused = () =>
    Promise.reject(new AuthClientError('auth/not-configured', UNCONFIGURED_MESSAGE))
  return {
    onAuthStateChanged(next) {
      queueMicrotask(() => next(null))
      return () => undefined
    },
    getIdToken: () => Promise.resolve(null),
    signInWithGoogle: refused,
    sendEmailLink: refused,
    isEmailLink: () => false,
    completeEmailLinkSignIn: refused,
    signOut: () => Promise.resolve(),
  }
}
