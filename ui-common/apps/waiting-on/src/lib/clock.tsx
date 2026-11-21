import { createContext, useContext, type ReactNode } from 'react'

/** Source of "now". Injected so screens and the mock API agree on the date and tests stay deterministic. */
export type Clock = () => Date

export const systemClock: Clock = () => new Date()

const ClockContext = createContext<Clock>(systemClock)

export function ClockProvider({ clock, children }: { clock: Clock; children: ReactNode }) {
  return <ClockContext value={clock}>{children}</ClockContext>
}

export function useClock(): Clock {
  return useContext(ClockContext)
}
