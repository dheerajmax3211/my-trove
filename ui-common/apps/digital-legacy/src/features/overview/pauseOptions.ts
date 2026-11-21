import type { StateView } from '../../api/types'
import { DAY } from '../../lib/format'

const PRESET_DAYS = [1, 3, 7, 14, 30, 60]

export interface PauseOptions {
  /** Durations (seconds) the owner may pick right now. */
  choices: number[]
  /** Longest single pause allowed: the smaller of the policy and the remaining yearly budget. */
  maxSeconds: number
  remainingSeconds: number
  /** Why pausing is unavailable, or null when it is possible. */
  blocked: string | null
}

export function pauseOptions(s: StateView): PauseOptions {
  const remaining = Math.max(0, s.pause.yearlyBudgetSeconds - s.pause.usedSeconds)
  const maxSeconds = Math.min(s.pause.maxSingleSeconds, remaining)
  const choices = PRESET_DAYS.map((d) => d * DAY).filter((seconds) => seconds <= maxSeconds)
  let blocked: string | null = null
  if (s.state === 'RELEASED') blocked = 'The vault has already been released.'
  else if (!s.armed) blocked = 'Vacation mode only applies while the switch is armed.'
  else if (s.state !== 'ACTIVE')
    blocked = 'Check in first: you can only pause while the switch is quiet.'
  else if (s.pausedUntil) blocked = null
  else if (choices.length === 0)
    blocked =
      s.pause.maxSingleSeconds === 0
        ? 'Your policy allows no vacation pauses. Raise the longest pause on the policy page.'
        : 'You have used your yearly vacation allowance.'
  return { choices, maxSeconds, remainingSeconds: remaining, blocked }
}
