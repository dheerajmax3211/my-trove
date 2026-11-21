import { AuthClientError, type AuthClient, type AuthUser } from './types'

export const DEV_IDP_STORAGE_KEY = 'pp.auth.devIdpSession'
/** The account "Continue with Google" signs in as when the dev identity provider is in use. */
export const DEV_IDP_DEFAULT_EMAIL = 'dev@example.test'

export interface DevIdpAuthClientOptions {
  /** Base URL of `dev/dev-idp.mjs`, e.g. `http://localhost:9100`. */
  baseUrl: string
  fetch?: typeof fetch
  /** Where to remember the signed-in email. Defaults to `localStorage` when available. */
  storage?: Pick<Storage, 'getItem' | 'setItem' | 'removeItem'> | null
  now?: () => number
}

interface IdpResponse {
  token: string
  expiresAt: number
  user: AuthUser
}

function defaultStorage(): DevIdpAuthClientOptions['storage'] {
  try {
    return typeof window === 'undefined' ? null : window.localStorage
  } catch {
    return null
  }
}

/**
 * AuthClient for local development against the real services without a Firebase project. It asks
 * the dev identity provider (`dev/dev-idp.mjs`) for an RS256 token that the services accept. Every
 * sign-in method signs in immediately: Google as `DEV_IDP_DEFAULT_EMAIL`, email link as the email
 * you typed. Never use this outside development.
 */
export function createDevIdpAuthClient(options: DevIdpAuthClientOptions): AuthClient {
  const baseUrl = options.baseUrl.replace(/\/+$/, '')
  const doFetch = options.fetch ?? ((...args) => globalThis.fetch(...args))
  const storage = options.storage === undefined ? defaultStorage() : options.storage
  const now = options.now ?? Date.now

  let user: AuthUser | null = null
  let cached: { token: string; expiresAt: number } | null = null
  let started = false
  const listeners = new Set<(user: AuthUser | null) => void>()
  const emit = () => listeners.forEach((listener) => listener(user))

  const remembered = (): string | null => {
    try {
      return storage?.getItem(DEV_IDP_STORAGE_KEY) ?? null
    } catch {
      return null
    }
  }
  const remember = (email: string | null) => {
    try {
      if (email) storage?.setItem(DEV_IDP_STORAGE_KEY, email)
      else storage?.removeItem(DEV_IDP_STORAGE_KEY)
    } catch {
      /* storage blocked: the session just will not survive a reload */
    }
  }

  async function requestToken(email: string): Promise<IdpResponse> {
    let response: Response
    try {
      response = await doFetch(`${baseUrl}/token`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ email }),
      })
    } catch {
      throw new AuthClientError(
        'auth/network-request-failed',
        `Cannot reach the dev identity provider at ${baseUrl}. Start it with dev/up.sh.`,
      )
    }
    if (!response.ok) {
      throw new AuthClientError(
        'auth/invalid-email',
        'The dev identity provider rejected that email.',
      )
    }
    return (await response.json()) as IdpResponse
  }

  async function signInAs(email: string): Promise<void> {
    const issued = await requestToken(email)
    user = issued.user
    cached = { token: issued.token, expiresAt: issued.expiresAt }
    remember(email)
    emit()
  }

  async function restore(): Promise<void> {
    const email = remembered()
    if (!email) return
    try {
      await signInAs(email)
    } catch {
      // IdP down: stay signed out; the user can retry from the sign-in screen.
      user = null
    }
  }

  return {
    onAuthStateChanged(next, onError) {
      listeners.add(next)
      if (!started) {
        started = true
        void restore().then(
          () => emit(),
          (error: Error) => onError?.(error),
        )
      } else {
        queueMicrotask(() => listeners.has(next) && next(user))
      }
      return () => listeners.delete(next)
    },

    async getIdToken(forceRefresh = false) {
      if (!user) return null
      if (!forceRefresh && cached && cached.expiresAt - now() > 60_000) return cached.token
      const issued = await requestToken(user.email ?? DEV_IDP_DEFAULT_EMAIL)
      cached = { token: issued.token, expiresAt: issued.expiresAt }
      return cached.token
    },

    signInWithGoogle: () => signInAs(DEV_IDP_DEFAULT_EMAIL),
    sendEmailLink: (email) => signInAs(email),
    isEmailLink: () => false,
    completeEmailLinkSignIn: async (email) => {
      if (!email) throw new AuthClientError('auth/email-required', 'Email required')
      await signInAs(email)
    },
    signOut() {
      user = null
      cached = null
      remember(null)
      emit()
      return Promise.resolve()
    },
  }
}
