import { formatCountdown } from '../lib/format'
import { useNow } from '../lib/clock'

/** Live time remaining until `target` (an ISO instant). Reads the app clock, so demo time travel shows. */
export function Countdown({ target, className }: { target: string; className?: string }) {
  const now = useNow()
  const remaining = new Date(target).getTime() - now
  return (
    <span role="timer" aria-live="off" className={className}>
      {remaining <= 0 ? 'due now' : formatCountdown(remaining)}
    </span>
  )
}
