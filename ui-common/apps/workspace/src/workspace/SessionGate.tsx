import { ApiProvider, useApiQuery } from '@platform/api-client'
import { useAuth } from '@platform/auth-web'
import { Button } from '@platform/ui'
import { createSession, WorkspaceSessionProvider } from '@platform/workspace-kit'
import { useEffect, useMemo, useRef, type ReactNode } from 'react'
import { ScreenMessage } from '../components/ScreenMessage'
import { useWorkspace } from './context'

/** The gateway caches token exchanges for 60 s, so a role change reaches a signed-in user within about a minute. */
export const SESSION_REFRESH_MS = 60_000

/** What `GET /auth/v1/me` returns. */
export interface MeResponse {
  id: string
  email: string | null
  displayName: string | null
  roles: string[]
  permissions: string[]
  plan: string
}

const ME_PATH = '/auth/v1/me'

function SessionLoader({ children }: { children: ReactNode }) {
  const { runtime, store } = useWorkspace()
  const { user, signOut } = useAuth()
  const me = useApiQuery<MeResponse>(ME_PATH, {
    staleTime: 0,
    refetchOnWindowFocus: false, // the focus and interval handlers below own refreshing
  })

  // Re-read the profile every minute and whenever the tab regains focus, so an admin's role change
  // (or a suspension) shows up without a reload. `cancelRefetch: false` keeps a request in flight.
  const refetchRef = useRef(me.refetch)
  useEffect(() => {
    refetchRef.current = me.refetch
  })
  useEffect(() => {
    const reread = () => void refetchRef.current({ cancelRefetch: false })
    const onVisible = () => {
      if (document.visibilityState === 'visible') reread()
    }
    const timer = window.setInterval(reread, SESSION_REFRESH_MS)
    window.addEventListener('focus', reread)
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      window.clearInterval(timer)
      window.removeEventListener('focus', reread)
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [])

  // Demo mode: choosing another persona in the account menu is a role change, so re-read /me.
  useEffect(
    () =>
      runtime.demo?.subscribe(() => {
        void store.workspace.queryClient.invalidateQueries({ queryKey: [ME_PATH] })
      }),
    [runtime.demo, store],
  )

  const data = me.data
  const isDemo = runtime.mode === 'demo'
  const session = useMemo(
    () =>
      data
        ? createSession({
            uid: data.id,
            email: data.email ?? user?.email ?? null,
            displayName: data.displayName ?? user?.displayName ?? null,
            roles: data.roles,
            permissions: data.permissions,
            plan: data.plan,
            isDemo,
          })
        : null,
    [data, user?.email, user?.displayName, isDemo],
  )

  if (!session) {
    if (me.isError) {
      return (
        <ScreenMessage
          title="We could not open your workspace"
          description="The platform did not answer when we asked who you are. Check your connection and try again."
          actions={
            <>
              <Button onClick={() => void me.refetch()}>Try again</Button>
              <Button variant="secondary" onClick={() => void signOut()}>
                Sign out
              </Button>
            </>
          }
        />
      )
    }
    return <ScreenMessage busy title="Opening your workspace" />
  }
  return <WorkspaceSessionProvider value={session}>{children}</WorkspaceSessionProvider>
}

/** Fetches the signed-in user's profile and permissions and provides them as the workspace session. */
export function SessionGate({ children }: { children: ReactNode }) {
  const { store } = useWorkspace()
  return (
    <ApiProvider client={store.workspace.client} queryClient={store.workspace.queryClient}>
      <SessionLoader>{children}</SessionLoader>
    </ApiProvider>
  )
}
