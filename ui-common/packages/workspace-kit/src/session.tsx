import { createContext, useContext, type ReactNode } from 'react'
import type { Permission } from './module'

export interface WorkspaceSession {
  uid: string
  email: string | null
  displayName: string | null
  roles: string[]
  permissions: string[]
  plan: string
  isDemo: boolean
  can: (permission: Permission) => boolean
}

/** Standalone product apps have no workspace: everything is allowed and the server decides. */
const STANDALONE: WorkspaceSession = {
  uid: 'standalone',
  email: null,
  displayName: null,
  roles: [],
  permissions: [],
  plan: 'FREE',
  isDemo: false,
  can: () => true,
}

const SessionContext = createContext<WorkspaceSession>(STANDALONE)

export function WorkspaceSessionProvider({
  value,
  children,
}: {
  value: WorkspaceSession
  children: ReactNode
}) {
  return <SessionContext value={value}>{children}</SessionContext>
}

export function useWorkspaceSession(): WorkspaceSession {
  return useContext(SessionContext)
}

/** Builds a session whose `can` checks the given permission list. */
export function createSession(
  input: Omit<WorkspaceSession, 'can'> & { can?: WorkspaceSession['can'] },
): WorkspaceSession {
  const set = new Set(input.permissions)
  return { ...input, can: input.can ?? ((p) => set.has(p)) }
}
