import { useAuth } from '@platform/auth-web'
import { useWorkspaceSession } from '@platform/workspace-kit'
import { createContext, useContext, type ReactNode } from 'react'
import { DEMO_VIEWER_UID } from './mock/seed'

/**
 * Who is looking, as the household ledger knows them (the Firebase uid that membership is keyed by).
 *
 * Standalone, and in the workspace with a real sign-in, that is the signed-in user. In the workspace's demo mode the
 * workspace signs in a stub user whose uid means nothing to the in-memory ledger, so the demo ledger is always viewed
 * as its owner (see `createDemoFetch`, which pins the same person on the wire).
 */
const ViewerContext = createContext<string | null>(null)

export function ViewerProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth()
  const session = useWorkspaceSession()
  const uid = session.isDemo ? DEMO_VIEWER_UID : (user?.uid ?? null)
  return <ViewerContext value={uid}>{children}</ViewerContext>
}

/** The viewer's uid, or `null` while nobody is signed in. */
export function useViewerUid(): string | null {
  return useContext(ViewerContext)
}
