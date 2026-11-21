import type { ProductModule } from '@platform/workspace-kit'
import { createContext, useContext } from 'react'
import type { RuntimeStore } from '../modules/runtimeStore'
import type { Runtime } from '../runtime'

export interface WorkspaceContextValue {
  runtime: Runtime
  /** API clients and query caches, one pair per module plus one for the workspace. */
  store: RuntimeStore
  /** The modules this workspace hosts (the real registry, or fakes in tests). */
  modules: readonly ProductModule[]
}

export const WorkspaceContext = createContext<WorkspaceContextValue | null>(null)

export function useWorkspace(): WorkspaceContextValue {
  const value = useContext(WorkspaceContext)
  if (!value) throw new Error('useWorkspace must be used within the signed-in workspace')
  return value
}
