import { useEffect, useState } from 'react'
import { useNow } from '../lib/clock'
import { Countdown } from './Countdown'

const RADIUS = 92
const CIRCUMFERENCE = 2 * Math.PI * RADIUS

export interface CountdownRingProps {
  /** ISO instant the ring counts down to. */
  target: string
  /** How long the whole stretch is, so the ring shows how much of it is left. Null: the ring is shown full. */
  totalSeconds: number | null
  /** Said above the time: "Next check-in due in". */
  label: string
  className?: string
}

/** Fraction of the stretch that is left, 0 to 1. Pure so it can be tested without a clock. */
export function remainingFraction(remainingMs: number, totalSeconds: number | null): number {
  if (totalSeconds === null || totalSeconds <= 0) return 1
  return Math.min(1, Math.max(0, remainingMs / (totalSeconds * 1000)))
}

/**
 * A ring that drains as the deadline approaches, with the live countdown in its middle. The arc sweeps in from empty
 * when it first appears, and follows the app clock afterwards (so demo time travel moves it).
 */
export function CountdownRing({ target, totalSeconds, label, className }: CountdownRingProps) {
  const now = useNow()
  const [shown, setShown] = useState(false)
  useEffect(() => {
    const id = requestAnimationFrame(() => setShown(true))
    return () => cancelAnimationFrame(id)
  }, [])
  const fraction = remainingFraction(new Date(target).getTime() - now, totalSeconds)
  const offset = shown ? CIRCUMFERENCE * (1 - fraction) : CIRCUMFERENCE
  return (
    <div className={className ? `dl-ring ${className}` : 'dl-ring'}>
      <svg viewBox="0 0 220 220" className="dl-ring-svg" aria-hidden="true" focusable="false">
        <circle className="dl-ring-track" cx="110" cy="110" r={RADIUS} />
        <circle
          className="dl-ring-arc"
          cx="110"
          cy="110"
          r={RADIUS}
          strokeDasharray={CIRCUMFERENCE}
          strokeDashoffset={offset}
          transform="rotate(-90 110 110)"
        />
      </svg>
      <div className="dl-ring-center">
        <span className="dl-ring-label">{label}</span>
        <Countdown target={target} className="dl-ring-time" />
      </div>
    </div>
  )
}
