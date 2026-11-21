import { createContext, useContext, type ReactNode } from 'react'

const ClockContext = createContext<() => Date>(() => new Date())

/** The app's notion of "now". Demo mode and tests inject the mock backend's clock so dates line up. */
export function ClockProvider({ now, children }: { now: () => Date; children: ReactNode }) {
  return <ClockContext value={now}>{children}</ClockContext>
}

export function useNow(): Date {
  return useContext(ClockContext)()
}
