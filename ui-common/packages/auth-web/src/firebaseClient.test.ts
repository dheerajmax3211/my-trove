import { beforeEach, describe, expect, it, vi } from 'vitest'

const h = vi.hoisted(() => {
  const user = {
    uid: 'u1',
    email: 'a@example.test',
    displayName: 'Ada',
    photoURL: null,
    emailVerified: true,
    getIdToken: vi.fn((force?: boolean) => Promise.resolve(force ? 'fresh-token' : 'cached-token')),
  }
  const auth = {
    currentUser: null as typeof user | null,
    authStateReady: vi.fn(() => Promise.resolve()),
  }
  return { user, auth }
})

vi.mock('firebase/app', () => ({
  getApps: vi.fn(() => []),
  initializeApp: vi.fn(() => ({ name: '[DEFAULT]' })),
}))

vi.mock('firebase/auth', () => ({
  getAuth: vi.fn(() => h.auth),
  connectAuthEmulator: vi.fn(),
  onAuthStateChanged: vi.fn((_auth: unknown, next: (u: unknown) => void) => {
    next(h.auth.currentUser)
    return () => {}
  }),
  GoogleAuthProvider: class {
    setCustomParameters = vi.fn()
  },
  signInWithPopup: vi.fn(() => Promise.resolve()),
  sendSignInLinkToEmail: vi.fn(() => Promise.resolve()),
  isSignInWithEmailLink: vi.fn(() => false),
  signInWithEmailLink: vi.fn(() => Promise.resolve()),
  signOut: vi.fn(() => Promise.resolve()),
}))

import { initializeApp } from 'firebase/app'
import {
  connectAuthEmulator,
  isSignInWithEmailLink,
  sendSignInLinkToEmail,
  signInWithEmailLink,
  signInWithPopup,
  signOut,
} from 'firebase/auth'
import { createFirebaseAuthClient, EMAIL_STORAGE_KEY } from './firebaseClient'

const config = { apiKey: 'k', projectId: 'p', authDomain: 'p.firebaseapp.com' }

beforeEach(() => {
  h.auth.currentUser = null
  window.localStorage.clear()
})

describe('createFirebaseAuthClient', () => {
  it('initializes the app from the config without undefined fields', () => {
    createFirebaseAuthClient(config)
    expect(initializeApp).toHaveBeenCalledWith({
      apiKey: 'k',
      projectId: 'p',
      authDomain: 'p.firebaseapp.com',
    })
  })

  it('connects the Auth emulator only when a host is configured, once per auth instance', () => {
    createFirebaseAuthClient(config)
    expect(connectAuthEmulator).not.toHaveBeenCalled()
    createFirebaseAuthClient({ ...config, authEmulatorHost: '127.0.0.1:9099' })
    createFirebaseAuthClient({ ...config, authEmulatorHost: '127.0.0.1:9099' })
    expect(connectAuthEmulator).toHaveBeenCalledTimes(1)
    expect(connectAuthEmulator).toHaveBeenCalledWith(h.auth, 'http://127.0.0.1:9099', {
      disableWarnings: true,
    })
  })

  it('maps Firebase users to AuthUser (no SDK objects leak out)', () => {
    h.auth.currentUser = h.user
    const next = vi.fn()
    createFirebaseAuthClient(config).onAuthStateChanged(next)
    expect(next).toHaveBeenCalledWith({
      uid: 'u1',
      email: 'a@example.test',
      displayName: 'Ada',
      photoURL: null,
      emailVerified: true,
    })
  })

  it('getIdToken waits for auth to be ready, supports force refresh, and returns null when signed out', async () => {
    const client = createFirebaseAuthClient(config)
    expect(await client.getIdToken()).toBeNull()
    h.auth.currentUser = h.user
    expect(await client.getIdToken()).toBe('cached-token')
    expect(await client.getIdToken(true)).toBe('fresh-token')
    expect(h.user.getIdToken).toHaveBeenLastCalledWith(true)
    expect(h.auth.authStateReady).toHaveBeenCalled()
  })

  it('signs in with Google via popup and forces account selection', async () => {
    await createFirebaseAuthClient(config).signInWithGoogle()
    expect(signInWithPopup).toHaveBeenCalledTimes(1)
    const provider = vi.mocked(signInWithPopup).mock.calls[0]?.[1] as unknown as {
      setCustomParameters: ReturnType<typeof vi.fn>
    }
    expect(provider.setCustomParameters).toHaveBeenCalledWith({ prompt: 'select_account' })
  })

  it('sends an email link for in-app completion and remembers the address', async () => {
    await createFirebaseAuthClient(config).sendEmailLink('me@example.test', {
      url: 'https://app.example.test/finish',
    })
    expect(sendSignInLinkToEmail).toHaveBeenCalledWith(h.auth, 'me@example.test', {
      url: 'https://app.example.test/finish',
      handleCodeInApp: true,
    })
    expect(window.localStorage.getItem(EMAIL_STORAGE_KEY)).toBe('me@example.test')
  })

  it('completes email-link sign-in with the remembered address, then forgets it', async () => {
    window.localStorage.setItem(EMAIL_STORAGE_KEY, 'me@example.test')
    await createFirebaseAuthClient(config).completeEmailLinkSignIn(
      undefined,
      'https://app.example.test/?oobCode=x',
    )
    expect(signInWithEmailLink).toHaveBeenCalledWith(
      h.auth,
      'me@example.test',
      'https://app.example.test/?oobCode=x',
    )
    expect(window.localStorage.getItem(EMAIL_STORAGE_KEY)).toBeNull()
  })

  it('asks for the email (auth/email-required) when the link is opened on another device', async () => {
    await expect(createFirebaseAuthClient(config).completeEmailLinkSignIn()).rejects.toMatchObject({
      code: 'auth/email-required',
    })
    expect(signInWithEmailLink).not.toHaveBeenCalled()
  })

  it('delegates isEmailLink and signOut', async () => {
    vi.mocked(isSignInWithEmailLink).mockReturnValueOnce(true)
    const client = createFirebaseAuthClient(config)
    expect(client.isEmailLink('https://x.test/?oobCode=1')).toBe(true)
    await client.signOut()
    expect(signOut).toHaveBeenCalledWith(h.auth)
  })
})
