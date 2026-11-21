import { ApiProvider, createApiQueryClient } from '@platform/api-client'
import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react'
import { createTrusteeApi, type TrusteeApi } from '../../api/trusteeApi'
import type { Runtime } from '../../runtime'
import type { UnsealedShare } from './trusteeService'

const STORAGE_KEY = 'dl.trustee.session'

interface Session {
  token: string
  trusteeId: string
}

interface TrusteeSessionValue {
  session: Session | null
  api: TrusteeApi
  /** Checks a token against the server and, when it is valid, remembers it on this device. */
  signInWithToken: (token: string) => Promise<void>
  remember: (session: Session) => void
  forget: () => void
  /** The trustee's opened share, kept in memory only so the combine screen can use it. */
  myShare: UnsealedShare | null
  setMyShare: (share: UnsealedShare | null) => void
}

const TrusteeSessionContext = createContext<TrusteeSessionValue | null>(null)

function readSession(): Session | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    const parsed = raw ? (JSON.parse(raw) as Partial<Session>) : null
    return parsed && typeof parsed.token === 'string' && typeof parsed.trusteeId === 'string'
      ? { token: parsed.token, trusteeId: parsed.trusteeId }
      : null
  } catch {
    return null
  }
}

function writeSession(session: Session | null): void {
  try {
    if (session) localStorage.setItem(STORAGE_KEY, JSON.stringify(session))
    else localStorage.removeItem(STORAGE_KEY)
  } catch {
    /* storage unavailable: the session lasts for this tab only */
  }
}

/**
 * The trustee portal's session. It authenticates with `Authorization: Trustee <token>` through its
 * own API client and query cache; nothing here touches Firebase or the owner app's state. Only the
 * access token is remembered on this device; the private key and any opened share stay in memory.
 */
export function TrusteeSessionProvider({
  runtime,
  children,
}: {
  runtime: Runtime
  children: ReactNode
}) {
  const [session, setSession] = useState<Session | null>(readSession)
  const [myShare, setMyShare] = useState<UnsealedShare | null>(null)
  const token = session?.token ?? null

  const client = useMemo(() => runtime.createTrusteeClient(token), [runtime, token])
  const api = useMemo(() => createTrusteeApi(client), [client])
  // a fresh query cache per token, so one trustee's data can never be shown to another
  const queryClient = useMemo(() => {
    void token
    return createApiQueryClient()
  }, [token])

  const remember = useCallback((next: Session) => {
    writeSession(next)
    setSession(next)
  }, [])
  const forget = useCallback(() => {
    writeSession(null)
    setSession(null)
    setMyShare(null)
  }, [])
  const signInWithToken = useCallback(
    async (candidate: string) => {
      const trimmed = candidate.trim()
      const me = await createTrusteeApi(runtime.createTrusteeClient(trimmed)).me()
      remember({ token: trimmed, trusteeId: me.trusteeId })
    },
    [runtime, remember],
  )

  const value = useMemo(
    () => ({ session, api, signInWithToken, remember, forget, myShare, setMyShare }),
    [session, api, signInWithToken, remember, forget, myShare],
  )
  return (
    <TrusteeSessionContext value={value}>
      <ApiProvider client={client} queryClient={queryClient}>
        {children}
      </ApiProvider>
    </TrusteeSessionContext>
  )
}

export function useTrusteeSession(): TrusteeSessionValue {
  const value = useContext(TrusteeSessionContext)
  if (!value) throw new Error('useTrusteeSession must be used within <TrusteeSessionProvider>')
  return value
}
