import { useCallback, useEffect, useState } from 'react'
import { useAuth } from './AuthProvider'

export interface UseIdTokenResult {
  token: string | null
  loading: boolean
  error: Error | null
  /** Force-refresh the token from the backend and update `token`. */
  refresh: () => Promise<string | null>
}

/**
 * The current user's ID token as React state (e.g. to pass to a non-fetch consumer like a
 * WebSocket). For HTTP calls prefer `getIdToken` from `useAuth()` / the api-client, which always
 * asks for a fresh-enough token at call time instead of holding one in state.
 */
export function useIdToken(): UseIdTokenResult {
  const { user, getIdToken } = useAuth()
  const uid = user?.uid ?? null
  const [state, setState] = useState<{
    uid: string | null
    token: string | null
    error: Error | null
  }>({
    uid: null,
    token: null,
    error: null,
  })

  useEffect(() => {
    if (!uid) return
    let cancelled = false
    getIdToken().then(
      (token) => !cancelled && setState({ uid, token, error: null }),
      (error: unknown) =>
        !cancelled &&
        setState({
          uid,
          token: null,
          error: error instanceof Error ? error : new Error(String(error)),
        }),
    )
    return () => {
      cancelled = true
    }
  }, [uid, getIdToken])

  const refresh = useCallback(async () => {
    const token = await getIdToken(true)
    setState({ uid, token, error: null })
    return token
  }, [getIdToken, uid])

  const current = state.uid === uid && uid !== null
  return {
    token: current ? state.token : null,
    loading: uid !== null && !current,
    error: current ? state.error : null,
    refresh,
  }
}
