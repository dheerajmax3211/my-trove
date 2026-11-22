import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import type { FirebaseAuthConfig } from './config'
import { createFirebaseAuthClient } from './firebaseClient'
import {
  AuthClientError,
  type AuthClient,
  type AuthStatus,
  type AuthUser,
  type DevSignIn,
} from './types'

export interface AuthContextValue {
  status: AuthStatus
  user: AuthUser | null
  /** Last error from sign-in/out. Cleared by the next successful action or `clearError()`. */
  error: Error | null
  /** An email-link sign-in was opened on a device that does not know the email; ask for it, then call `completeEmailLinkSignIn(email)`. */
  emailLinkPending: boolean
  /** Set only with the local dev identity provider: show its account chooser instead of Google. */
  dev: DevSignIn | null
  /** Dev only: sign in as one of `dev.accounts`. */
  signInAsDevAccount: (email: string) => Promise<boolean>
  /** The action functions never throw: they resolve `true` on success, or `false` and set `error`. */
  signInWithGoogle: () => Promise<boolean>
  sendEmailLink: (email: string, options?: { url?: string }) => Promise<boolean>
  completeEmailLinkSignIn: (email?: string) => Promise<boolean>
  signOut: () => Promise<boolean>
  /** Current Firebase ID token, or null when signed out. Pass `true` to force a refresh. */
  getIdToken: (forceRefresh?: boolean) => Promise<string | null>
  clearError: () => void
}

const AuthContext = createContext<AuthContextValue | null>(null)

const EMAIL_LINK_PARAMS = ['apiKey', 'oobCode', 'mode', 'lang', 'continueUrl']

function stripEmailLinkParams(): void {
  try {
    const url = new URL(window.location.href)
    EMAIL_LINK_PARAMS.forEach((p) => url.searchParams.delete(p))
    window.history.replaceState(window.history.state as unknown, '', url.toString())
  } catch {
    /* non-browser or sandboxed history: leaving the params in place is harmless */
  }
}

export type AuthProviderProps = {
  children: ReactNode
  /** Complete an email sign-in link found in the current URL on mount. Default true. */
  autoCompleteEmailLink?: boolean
} & ({ client: AuthClient; config?: never } | { config: FirebaseAuthConfig; client?: never })

/**
 * Provides auth state to the tree. Pass a `client` (any AuthClient: Firebase, stub) or a Firebase
 * `config` (from `getFirebaseConfigFromEnv(import.meta.env)`); a config is read once, at mount.
 */
export function AuthProvider({
  children,
  autoCompleteEmailLink = true,
  ...source
}: AuthProviderProps) {
  const [configClient] = useState(() =>
    source.config ? createFirebaseAuthClient(source.config) : null,
  )
  const client = (source.client ?? configClient) as AuthClient

  const [user, setUser] = useState<AuthUser | null>(null)
  const [status, setStatus] = useState<AuthStatus>('loading')
  const [error, setError] = useState<Error | null>(null)
  const [emailLinkPending, setEmailLinkPending] = useState(false)

  useEffect(() => {
    return client.onAuthStateChanged(
      (next) => {
        setUser(next)
        setStatus(next ? 'authenticated' : 'unauthenticated')
      },
      (err) => {
        setError(err)
        setStatus('unauthenticated')
      },
    )
  }, [client])

  const run = useCallback(async (action: () => Promise<void>): Promise<boolean> => {
    try {
      await action()
      setError(null)
      return true
    } catch (err) {
      setError(err instanceof Error ? err : new Error(String(err)))
      return false
    }
  }, [])

  const completeEmailLinkSignIn = useCallback(
    async (email?: string) => {
      const ok = await run(() => client.completeEmailLinkSignIn(email))
      if (ok) {
        setEmailLinkPending(false)
        stripEmailLinkParams()
      }
      return ok
    },
    [client, run],
  )

  const handledLink = useRef(false)
  useEffect(() => {
    if (!autoCompleteEmailLink || handledLink.current || !client.isEmailLink()) return
    handledLink.current = true // StrictMode double-mount must not consume the one-time code twice
    void (async () => {
      try {
        await client.completeEmailLinkSignIn()
        stripEmailLinkParams()
      } catch (err) {
        if (err instanceof AuthClientError && err.code === 'auth/email-required')
          setEmailLinkPending(true)
        else setError(err instanceof Error ? err : new Error(String(err)))
      }
    })()
  }, [autoCompleteEmailLink, client])

  const getIdToken = useCallback(
    (forceRefresh?: boolean) => client.getIdToken(forceRefresh),
    [client],
  )

  const value = useMemo<AuthContextValue>(
    () => ({
      status,
      user,
      error,
      emailLinkPending,
      dev: client.dev ?? null,
      signInAsDevAccount: (email) =>
        run(async () => {
          if (!client.dev) throw new AuthClientError('auth/not-dev', 'Dev accounts are not in use.')
          await client.dev.signInAs(email)
        }),
      signInWithGoogle: () => run(() => client.signInWithGoogle()),
      sendEmailLink: (email, options) => run(() => client.sendEmailLink(email, options)),
      completeEmailLinkSignIn,
      signOut: () => run(() => client.signOut()),
      getIdToken,
      clearError: () => setError(null),
    }),
    [client, status, user, error, emailLinkPending, run, completeEmailLinkSignIn, getIdToken],
  )

  return <AuthContext value={value}>{children}</AuthContext>
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within <AuthProvider>')
  return ctx
}
