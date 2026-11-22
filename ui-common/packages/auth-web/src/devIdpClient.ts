import {
  AuthClientError,
  type AuthClient,
  type AuthUser,
  type DevAccount,
  type DevSignIn,
} from './types'

export const DEV_IDP_STORAGE_KEY = 'pp.auth.devIdpSession'
/** The address typed for an email link, remembered on this device. Same key the Firebase client uses. */
export const DEV_IDP_LINK_EMAIL_KEY = 'pp.auth.emailForSignIn'
/** The account the dev identity provider signs in as when no account is named (the bootstrap owner). */
export const DEV_IDP_DEFAULT_EMAIL = 'dev@example.test'

/**
 * The five seeded accounts (`dev/seed-personas.sh`). `roles` is what the seed grants; the workspace shows the live
 * roles once signed in, so a changed role is never hidden behind this list.
 */
export const DEV_ACCOUNTS: readonly DevAccount[] = [
  {
    email: 'dev@example.test',
    persona: 'OWNER',
    label: 'Owner',
    roles: 'Owner, Admin, Member',
    summary: 'Runs the platform: every permission, including granting Admin and changing plans.',
  },
  {
    email: 'admin@example.test',
    persona: 'ADMIN',
    label: 'Admin',
    roles: 'Admin, Member',
    summary: 'Operates the platform: people, roles, usage, flags and the audit log.',
  },
  {
    email: 'developer@example.test',
    persona: 'DEVELOPER',
    label: 'Developer',
    roles: 'Developer, Member',
    summary: 'Builds on the platform: apps, API keys, webhooks and the sandbox.',
  },
  {
    email: 'member@example.test',
    persona: 'MEMBER',
    label: 'Member',
    roles: 'Member',
    summary: 'Uses the products with their own data.',
  },
  {
    email: 'auditor@example.test',
    persona: 'AUDITOR',
    label: 'Auditor',
    roles: 'Auditor, Member',
    summary: 'Read-only oversight: usage, people and the audit log.',
  },
]

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

interface IdpLinkResponse {
  code: string
  email: string
}

function defaultStorage(): DevIdpAuthClientOptions['storage'] {
  try {
    return typeof window === 'undefined' ? null : window.localStorage
  } catch {
    return null
  }
}

const currentHref = (): string => (typeof window === 'undefined' ? '' : window.location.href)
const currentOrigin = (): string => (typeof window === 'undefined' ? '' : window.location.origin)

/**
 * AuthClient for local development against the real services without a Firebase project. It asks the dev identity
 * provider (`dev/dev-idp.mjs`) for RS256 tokens that the services accept.
 *
 * Nothing signs in silently:
 *  - Google is replaced by a chooser of the five seeded accounts (`dev.accounts`, `dev.signInAs`).
 *    `signInWithGoogle` refuses, so no caller can pick an account by accident.
 *  - An email link is issued by the identity provider and bound to the address. No email is sent: the page shows the
 *    link (`dev.lastEmailLink`), and opening it completes sign-in for that address only, once.
 *
 * Never use this outside development.
 */
export function createDevIdpAuthClient(options: DevIdpAuthClientOptions): AuthClient {
  const baseUrl = options.baseUrl.replace(/\/+$/, '')
  const doFetch = options.fetch ?? ((...args) => globalThis.fetch(...args))
  const storage = options.storage === undefined ? defaultStorage() : options.storage
  const now = options.now ?? Date.now

  let user: AuthUser | null = null
  let cached: { token: string; expiresAt: number } | null = null
  let started = false
  let lastLink: string | null = null
  const listeners = new Set<(user: AuthUser | null) => void>()
  const emit = () => listeners.forEach((listener) => listener(user))

  const remembered = (key: string): string | null => {
    try {
      return storage?.getItem(key) ?? null
    } catch {
      return null
    }
  }
  const write = (key: string, value: string | null) => {
    try {
      if (value) storage?.setItem(key, value)
      else storage?.removeItem(key)
    } catch {
      /* storage blocked: the session just will not survive a reload */
    }
  }

  async function post<T>(
    path: string,
    body: unknown,
    rejected: (status: number, message: string) => AuthClientError,
  ): Promise<T> {
    let response: Response
    try {
      response = await doFetch(`${baseUrl}${path}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      })
    } catch {
      throw new AuthClientError(
        'auth/network-request-failed',
        `Cannot reach the dev identity provider at ${baseUrl}. Start it with dev/up.sh.`,
      )
    }
    if (!response.ok) {
      const payload = (await response.json().catch(() => ({}))) as { error?: string }
      throw rejected(
        response.status,
        payload.error ?? `The dev identity provider answered ${response.status}.`,
      )
    }
    return (await response.json()) as T
  }

  const requestToken = (email: string) =>
    post<IdpResponse>(
      '/token',
      { email },
      (_status, message) => new AuthClientError('auth/invalid-email', message),
    )

  function accept(issued: IdpResponse, email: string) {
    user = issued.user
    cached = { token: issued.token, expiresAt: issued.expiresAt }
    write(DEV_IDP_STORAGE_KEY, email)
    emit()
  }

  async function signInAs(email: string): Promise<void> {
    accept(await requestToken(email), email)
  }

  async function restore(): Promise<void> {
    const email = remembered(DEV_IDP_STORAGE_KEY)
    if (!email) return
    try {
      await signInAs(email)
    } catch {
      // IdP down: stay signed out; the user can retry from the sign-in screen.
      user = null
    }
  }

  const codeFrom = (url: string): string | null => {
    try {
      return new URL(url).searchParams.get('oobCode')
    } catch {
      return null
    }
  }

  const dev: DevSignIn = {
    accounts: DEV_ACCOUNTS,
    signInAs: (email) => signInAs(email.trim().toLowerCase()),
    lastEmailLink: () => lastLink,
  }

  return {
    dev,

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

    signInWithGoogle() {
      return Promise.reject(
        new AuthClientError(
          'auth/dev-account-required',
          'In development, pick one of the dev accounts instead of Google.',
        ),
      )
    },

    async sendEmailLink(email, sendOptions) {
      const issued = await post<IdpLinkResponse>(
        '/link',
        { email },
        (_status, message) => new AuthClientError('auth/invalid-email', message),
      )
      const origin = (sendOptions?.url ?? currentOrigin()).replace(/\/+$/, '')
      lastLink = `${origin}/?mode=signIn&oobCode=${encodeURIComponent(issued.code)}`
      write(DEV_IDP_LINK_EMAIL_KEY, issued.email)
    },

    isEmailLink(url = currentHref()) {
      try {
        const parsed = new URL(url)
        return (
          parsed.searchParams.get('mode') === 'signIn' &&
          Boolean(parsed.searchParams.get('oobCode'))
        )
      } catch {
        return false
      }
    },

    async completeEmailLinkSignIn(email, url = currentHref()) {
      const resolved = email?.trim().toLowerCase() || remembered(DEV_IDP_LINK_EMAIL_KEY)
      if (!resolved) {
        throw new AuthClientError(
          'auth/email-required',
          'Enter the email address the sign-in link was sent to.',
        )
      }
      const code = codeFrom(url)
      if (!code)
        throw new AuthClientError(
          'auth/invalid-action-code',
          'This sign-in link is incomplete. Ask for a new one.',
        )
      const issued = await post<IdpResponse>(
        '/link/consume',
        { code, email: resolved },
        (status, message) =>
          new AuthClientError(
            status === 410 ? 'auth/expired-action-code' : 'auth/invalid-email',
            message,
          ),
      )
      write(DEV_IDP_LINK_EMAIL_KEY, null)
      lastLink = null
      accept(issued, resolved)
    },

    signOut() {
      user = null
      cached = null
      write(DEV_IDP_STORAGE_KEY, null)
      emit()
      return Promise.resolve()
    },
  }
}
