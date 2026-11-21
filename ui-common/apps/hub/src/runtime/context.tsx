import type { QueryClient } from '@tanstack/react-query'
import { createContext, useContext, type ReactNode } from 'react'
import type { HubRuntime } from './runtime'

const RuntimeContext = createContext<HubRuntime | null>(null)

export function RuntimeProvider({
  runtime,
  children,
}: {
  runtime: HubRuntime
  children: ReactNode
}) {
  return <RuntimeContext value={runtime}>{children}</RuntimeContext>
}

export function useRuntime(): HubRuntime {
  const runtime = useContext(RuntimeContext)
  if (!runtime) throw new Error('useRuntime must be used within <RuntimeProvider>')
  return runtime
}

/**
 * The cache the Household module reads through (the auth client has its own). The Account page's demo clock
 * tool invalidates it so reminders that came due show up on the next visit.
 */
export const SharedQueryClientContext = createContext<QueryClient | null>(null)

export function useSharedQueryClient(): QueryClient | null {
  return useContext(SharedQueryClientContext)
}
