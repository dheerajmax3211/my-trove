export interface AuthUser {
  uid: string
  email: string | null
  displayName: string | null
  photoURL: string | null
  emailVerified: boolean
}

export type AuthStatus = 'loading' | 'authenticated' | 'unauthenticated'

export type Unsubscribe = () => void

/** Error with a stable, Firebase-style `code` (e.g. `auth/email-required`). */
export class AuthClientError extends Error {
  readonly code: string
  constructor(code: string, message: string) {
    super(message)
    this.name = 'AuthClientError'
    this.code = code
  }
}

/**
 * The seam between React and an auth backend. `createFirebaseAuthClient` implements it with the
 * Firebase JS SDK; `createStubAuthClient` implements it in memory for demos and tests.
 */
export interface AuthClient {
  /** Fires once with the initial state, then on every sign-in / sign-out. */
  onAuthStateChanged: (
    next: (user: AuthUser | null) => void,
    onError?: (error: Error) => void,
  ) => Unsubscribe
  /** Current ID token (refreshing it if expired, or always when `forceRefresh`). `null` when signed out. */
  getIdToken: (forceRefresh?: boolean) => Promise<string | null>
  signInWithGoogle: () => Promise<void>
  /** Sends a passwordless sign-in link and remembers the email on this device. */
  sendEmailLink: (email: string, options?: { url?: string }) => Promise<void>
  /** Is `url` (default: current location) an email sign-in link? */
  isEmailLink: (url?: string) => boolean
  /** Finish email-link sign-in. Uses the remembered email unless `email` is given. */
  completeEmailLinkSignIn: (email?: string, url?: string) => Promise<void>
  signOut: () => Promise<void>
}
