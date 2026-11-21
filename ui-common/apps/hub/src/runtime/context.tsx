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
