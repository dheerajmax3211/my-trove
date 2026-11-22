import { useAuth } from '@platform/auth-web'
import { useCallback } from 'react'
import { useWorkspace } from './context'

/**
 * Sign out for real: forget the demo flag first (otherwise a reload drops you straight back into the demo),
 * end the session, then reload the app at its root so every cache and mock backend starts clean.
 */
export function useSignOut(): () => Promise<void> {
  const { runtime } = useWorkspace()
  const { signOut } = useAuth()
  return useCallback(async () => {
    runtime.leaveDemo()
    await signOut()
    window.location.assign('/')
  }, [runtime, signOut])
}
