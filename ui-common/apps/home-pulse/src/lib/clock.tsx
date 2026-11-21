import { createContext, useContext, type ReactNode } from 'react'

/** The current time, injected so screens and tests agree on "now". */
export type Clock = () => Date

export const systemClock: Clock = () => new Date()

const ClockContext = createContext<Clock>(systemClock)

export function ClockProvider({ clock, children }: { clock: Clock; children: ReactNode }) {
  return <ClockContext value={clock}>{children}</ClockContext>
}

export function useClock(): Clock {
  return useContext(ClockContext)
}
