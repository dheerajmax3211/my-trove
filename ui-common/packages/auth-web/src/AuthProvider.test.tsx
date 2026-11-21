import { act, render, renderHook, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { StrictMode, type ReactNode } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

// Firebase is fully mocked: these tests exercise the provider against the real
// createFirebaseAuthClient code path, with the SDK replaced by controllable fakes.
const fb = vi.hoisted(() => {
  const user = {
    uid: 'u1',
    email: 'ada@example.test',
    displayName: 'Ada',
    photoURL: null,
    emailVerified: true,
    getIdToken: vi.fn((force?: boolean) => Promise.resolve(force ? 'token-2' : 'token-1')),
  }
  const auth = { currentUser: null as typeof user | null, authStateReady: () => Promise.resolve() }
  const state = {
    user,
    auth,
    emit: null as null | ((u: typeof user | null) => void),
    emitError: null as null | ((e: Error) => void),
    emailLink: false,
  }
  return state
})

vi.mock('firebase/app', () => ({
  getApps: vi.fn(() => []),
  initializeApp: vi.fn(() => ({ name: '[DEFAULT]' })),
}))

vi.mock('firebase/auth', () => ({
  getAuth: vi.fn(() => fb.auth),
  connectAuthEmulator: vi.fn(),
  onAuthStateChanged: vi.fn(
    (_a: unknown, next: (u: unknown) => void, onError: (e: Error) => void) => {
      fb.emit = (u) => {
        fb.auth.currentUser = u
        next(u)
      }
      fb.emitError = onError
      return () => {
        fb.emit = null
      }
    },
  ),
  GoogleAuthProvider: class {
    setCustomParameters = vi.fn()
  },
  signInWithPopup: vi.fn(() => Promise.resolve()),
  sendSignInLinkToEmail: vi.fn(() => Promise.resolve()),
  isSignInWithEmailLink: vi.fn(() => fb.emailLink),
  signInWithEmailLink: vi.fn(() => Promise.resolve()),
  signOut: vi.fn(() => Promise.resolve()),
}))

import { signInWithEmailLink, signInWithPopup, signOut } from 'firebase/auth'
import { AuthProvider, useAuth } from './AuthProvider'
import { EMAIL_STORAGE_KEY } from './firebaseClient'
import { RequireAuth } from './RequireAuth'
import { createStubAuthClient, DEMO_USER } from './stubClient'
import { useIdToken } from './useIdToken'

const config = { apiKey: 'k', projectId: 'p' }
const wrapper = ({ children }: { children: ReactNode }) => (
  <AuthProvider config={config}>{children}</AuthProvider>
)

beforeEach(() => {
  fb.auth.currentUser = null
  fb.emailLink = false
  fb.emit = null
  window.localStorage.clear()
  window.history.replaceState({}, '', '/')
})

describe('AuthProvider (mocked Firebase)', () => {
  it('starts in loading, then reflects the signed-in user', () => {
    const { result } = renderHook(() => useAuth(), { wrapper })
    expect(result.current.status).toBe('loading')
    act(() => fb.emit?.(fb.user))
    expect(result.current.status).toBe('authenticated')
    expect(result.current.user).toEqual({
      uid: 'u1',
      email: 'ada@example.test',
      displayName: 'Ada',
      photoURL: null,
      emailVerified: true,
    })
  })

  it('reflects sign-out', () => {
    const { result } = renderHook(() => useAuth(), { wrapper })
    act(() => fb.emit?.(fb.user))
    act(() => fb.emit?.(null))
    expect(result.current.status).toBe('unauthenticated')
    expect(result.current.user).toBeNull()
  })

  it('unsubscribes from Firebase on unmount', () => {
    const { unmount } = renderHook(() => useAuth(), { wrapper })
    expect(fb.emit).not.toBeNull()
    unmount()
    expect(fb.emit).toBeNull()
  })

  it('treats an auth listener error as signed out and exposes it', () => {
    const { result } = renderHook(() => useAuth(), { wrapper })
    act(() => fb.emitError?.(new Error('boom')))
    expect(result.current.status).toBe('unauthenticated')
    expect(result.current.error?.message).toBe('boom')
  })

  it('signInWithGoogle resolves true; failures resolve false and set error instead of throwing', async () => {
    const { result } = renderHook(() => useAuth(), { wrapper })
    await expect(act(() => result.current.signInWithGoogle())).resolves.toBe(true)
    expect(signInWithPopup).toHaveBeenCalledTimes(1)

    vi.mocked(signInWithPopup).mockRejectedValueOnce(
      Object.assign(new Error('popup closed'), { code: 'auth/popup-closed-by-user' }),
    )
    let ok = true
    await act(async () => {
      ok = await result.current.signInWithGoogle()
    })
    expect(ok).toBe(false)
    expect(result.current.error?.message).toBe('popup closed')
    act(() => result.current.clearError())
    expect(result.current.error).toBeNull()
  })

  it('signOut calls Firebase', async () => {
    const { result } = renderHook(() => useAuth(), { wrapper })
    await act(() => result.current.signOut())
    expect(signOut).toHaveBeenCalledWith(fb.auth)
  })

  it('getIdToken returns the current token and honours forceRefresh', async () => {
    const { result } = renderHook(() => useAuth(), { wrapper })
    act(() => fb.emit?.(fb.user))
    expect(await result.current.getIdToken()).toBe('token-1')
    expect(await result.current.getIdToken(true)).toBe('token-2')
  })

  it('throws a clear error when useAuth is used outside the provider', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    expect(() => renderHook(() => useAuth())).toThrow(/AuthProvider/)
    spy.mockRestore()
  })

  describe('email link', () => {
    it('completes sign-in automatically once, even under StrictMode, and cleans the URL', async () => {
      fb.emailLink = true
      window.localStorage.setItem(EMAIL_STORAGE_KEY, 'ada@example.test')
      window.history.replaceState({}, '', '/?apiKey=k&oobCode=abc&mode=signIn&keep=1')
      render(
        <StrictMode>
          <AuthProvider config={config}>
            <span>child</span>
          </AuthProvider>
        </StrictMode>,
      )
      await waitFor(() => expect(signInWithEmailLink).toHaveBeenCalledTimes(1))
      await waitFor(() => expect(window.location.search).toBe('?keep=1'))
    })

    it('flags emailLinkPending when the link is opened on a device without the stored email', async () => {
      fb.emailLink = true
      const { result } = renderHook(() => useAuth(), { wrapper })
      await waitFor(() => expect(result.current.emailLinkPending).toBe(true))
      expect(signInWithEmailLink).not.toHaveBeenCalled()

      await act(async () => {
        await result.current.completeEmailLinkSignIn('ada@example.test')
      })
      expect(signInWithEmailLink).toHaveBeenCalledWith(
        fb.auth,
        'ada@example.test',
        expect.any(String),
      )
      expect(result.current.emailLinkPending).toBe(false)
    })

    it('does nothing when autoCompleteEmailLink is off', () => {
      fb.emailLink = true
      window.localStorage.setItem(EMAIL_STORAGE_KEY, 'ada@example.test')
      renderHook(() => useAuth(), {
        wrapper: ({ children }) => (
          <AuthProvider config={config} autoCompleteEmailLink={false}>
            {children}
          </AuthProvider>
        ),
      })
      expect(signInWithEmailLink).not.toHaveBeenCalled()
    })
  })

  it('useIdToken resolves the token for the signed-in user and can force-refresh it', async () => {
    const { result } = renderHook(() => useIdToken(), {
      wrapper: ({ children }) => <AuthProvider config={config}>{children}</AuthProvider>,
    })
    expect(result.current.token).toBeNull()
    expect(result.current.loading).toBe(false)
    act(() => fb.emit?.(fb.user))
    await waitFor(() => expect(result.current.token).toBe('token-1'))
    await act(async () => {
      await result.current.refresh()
    })
    expect(result.current.token).toBe('token-2')
    act(() => fb.emit?.(null))
    expect(result.current.token).toBeNull()
  })
})

describe('RequireAuth', () => {
  function Guarded({
    client,
    onUnauthenticated,
  }: {
    client: ReturnType<typeof createStubAuthClient>
    onUnauthenticated?: () => void
  }) {
    return (
      <AuthProvider client={client}>
        <RequireAuth
          loading={<p>checking...</p>}
          fallback={<p>please sign in</p>}
          {...(onUnauthenticated ? { onUnauthenticated } : {})}
        >
          <p>secret</p>
        </RequireAuth>
      </AuthProvider>
    )
  }

  it('shows loading, then the fallback when signed out', async () => {
    const onUnauthenticated = vi.fn()
    render(<Guarded client={createStubAuthClient()} onUnauthenticated={onUnauthenticated} />)
    expect(screen.getByText('checking...')).toBeInTheDocument()
    expect(await screen.findByText('please sign in')).toBeInTheDocument()
    expect(screen.queryByText('secret')).not.toBeInTheDocument()
    expect(onUnauthenticated).toHaveBeenCalled()
  })

  it('renders children when signed in', async () => {
    render(<Guarded client={createStubAuthClient({ initialUser: DEMO_USER })} />)
    expect(await screen.findByText('secret')).toBeInTheDocument()
  })

  it('switches to the fallback when the user signs out', async () => {
    const client = createStubAuthClient({ initialUser: DEMO_USER })
    function Out() {
      const { signOut } = useAuth()
      return <button onClick={() => void signOut()}>out</button>
    }
    render(
      <AuthProvider client={client}>
        <RequireAuth fallback={<p>please sign in</p>}>
          <p>secret</p>
          <Out />
        </RequireAuth>
      </AuthProvider>,
    )
    await userEvent.click(await screen.findByText('out'))
    expect(await screen.findByText('please sign in')).toBeInTheDocument()
  })
})

describe('createStubAuthClient', () => {
  it('issues new tokens on refresh and supports simulated expiry', async () => {
    const client = createStubAuthClient({ initialUser: DEMO_USER })
    expect(await client.getIdToken()).toBe('stub-token-1')
    client.expireToken()
    expect(await client.getIdToken()).toBe('stub-token-1-expired')
    expect(await client.getIdToken(true)).toBe('stub-token-2')
    expect(client.issuedTokens()).toBe(2)
  })

  it('returns no token when signed out', async () => {
    expect(await createStubAuthClient().getIdToken()).toBeNull()
  })
})
