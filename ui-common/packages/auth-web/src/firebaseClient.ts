import { getApps, initializeApp, type FirebaseApp } from 'firebase/app'
import {
  GoogleAuthProvider,
  connectAuthEmulator,
  getAuth,
  isSignInWithEmailLink,
  onAuthStateChanged,
  sendSignInLinkToEmail,
  signInWithEmailLink,
  signInWithPopup,
  signOut,
  type Auth,
  type User,
} from 'firebase/auth'
import type { FirebaseAuthConfig } from './config'
import { createDevIdpAuthClient } from './devIdpClient'
import { AuthClientError, type AuthClient, type AuthUser } from './types'

export const EMAIL_STORAGE_KEY = 'pp.auth.emailForSignIn'

const connectedEmulators = new WeakSet<Auth>()

function toAuthUser(user: User): AuthUser {
  return {
    uid: user.uid,
    email: user.email,
    displayName: user.displayName,
    photoURL: user.photoURL,
    emailVerified: user.emailVerified,
  }
}

function storage(): Storage | null {
  try {
    return typeof window === 'undefined' ? null : window.localStorage
  } catch {
    return null
  }
}

function getOrCreateApp(config: FirebaseAuthConfig): FirebaseApp {
  const name = config.appName ?? '[DEFAULT]'
  const existing = getApps().find((app) => app.name === name)
  if (existing) return existing
  const options = {
    apiKey: config.apiKey,
    projectId: config.projectId,
    ...(config.authDomain ? { authDomain: config.authDomain } : {}),
    ...(config.appId ? { appId: config.appId } : {}),
    ...(config.storageBucket ? { storageBucket: config.storageBucket } : {}),
    ...(config.messagingSenderId ? { messagingSenderId: config.messagingSenderId } : {}),
  }
  return config.appName ? initializeApp(options, config.appName) : initializeApp(options)
}

/** Firebase-backed AuthClient. Connects to the Auth emulator when `config.authEmulatorHost` is set; uses the dev identity provider when `config.devIdpUrl` is set. */
export function createFirebaseAuthClient(config: FirebaseAuthConfig): AuthClient {
  // Local development without a Firebase project: sign in against dev/dev-idp.mjs instead.
  if (config.devIdpUrl) return createDevIdpAuthClient({ baseUrl: config.devIdpUrl })
  const auth = getAuth(getOrCreateApp(config))
  if (config.authEmulatorHost && !connectedEmulators.has(auth)) {
    connectAuthEmulator(auth, `http://${config.authEmulatorHost}`, { disableWarnings: true })
    connectedEmulators.add(auth)
  }

  return {
    onAuthStateChanged(next, onError) {
      return onAuthStateChanged(
        auth,
        (user) => next(user ? toAuthUser(user) : null),
        (error) => onError?.(error),
      )
    },

    async getIdToken(forceRefresh = false) {
      // Wait for the persisted session to load so early callers do not see a spurious signed-out state.
      await auth.authStateReady()
      return (await auth.currentUser?.getIdToken(forceRefresh)) ?? null
    },

    async signInWithGoogle() {
      const provider = new GoogleAuthProvider()
      provider.setCustomParameters({ prompt: 'select_account' })
      await signInWithPopup(auth, provider)
    },

    async sendEmailLink(email, options) {
      const url = options?.url ?? `${window.location.origin}${window.location.pathname}`
      await sendSignInLinkToEmail(auth, email, { url, handleCodeInApp: true })
      // Needed to finish sign-in on this device; if the user opens the link elsewhere they are asked for it.
      storage()?.setItem(EMAIL_STORAGE_KEY, email)
    },

    isEmailLink(url = window.location.href) {
      return isSignInWithEmailLink(auth, url)
    },

    async completeEmailLinkSignIn(email, url = window.location.href) {
      const resolved = email ?? storage()?.getItem(EMAIL_STORAGE_KEY) ?? undefined
      if (!resolved) {
        throw new AuthClientError(
          'auth/email-required',
          'Enter the email address the sign-in link was sent to.',
        )
      }
      await signInWithEmailLink(auth, resolved, url)
      storage()?.removeItem(EMAIL_STORAGE_KEY)
    },

    async signOut() {
      await signOut(auth)
    },
  }
}
