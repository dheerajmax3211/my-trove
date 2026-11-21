import { createContext, useContext } from 'react'
import type { DemoParts, Runtime } from './runtime'

export const RuntimeContext = createContext<Runtime | null>(null)

/** Demo-mode controls (persona switch, drift injection), or `null` in the workspace and in live mode. */
export function useDemoParts(): DemoParts | null {
  return useContext(RuntimeContext)?.demo ?? null
}

export function useRuntime(): Runtime {
  const runtime = useContext(RuntimeContext)
  if (!runtime) throw new Error('useRuntime must be used within <App>')
  return runtime
}
