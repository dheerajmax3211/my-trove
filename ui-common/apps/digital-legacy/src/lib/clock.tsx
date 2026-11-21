import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'

const ClockContext = createContext<() => number>(Date.now)

/** Supplies "now" to countdowns, so demo mode can fast-forward and tests are deterministic. */
export function ClockProvider({ now, children }: { now: () => number; children: ReactNode }) {
  return <ClockContext value={now}>{children}</ClockContext>
}

export function useClock(): () => number {
  return useContext(ClockContext)
}

/** Current time in ms, refreshed every `intervalMs`. */
export function useNow(intervalMs = 1000): number {
  const clock = useClock()
  const [now, setNow] = useState(() => clock())
  useEffect(() => {
    const id = setInterval(() => setNow(clock()), intervalMs)
    return () => clearInterval(id)
  }, [clock, intervalMs])
  return now
}
