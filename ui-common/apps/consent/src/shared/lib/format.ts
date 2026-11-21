import type { AllowedHours } from '../api/types'

const MINUTE = 60
const HOUR = 3600
const DAY = 86_400

const plural = (n: number, unit: string) => `${n} ${unit}${n === 1 ? '' : 's'}`

/** 604800 -> "7 days", 5400 -> "1 hour 30 minutes". */
export function formatDuration(seconds: number): string {
  if (seconds < MINUTE) return plural(Math.max(0, Math.round(seconds)), 'second')
  const days = Math.floor(seconds / DAY)
  const hours = Math.floor((seconds % DAY) / HOUR)
  const minutes = Math.floor((seconds % HOUR) / MINUTE)
  const parts = [
    days > 0 && plural(days, 'day'),
    hours > 0 && plural(hours, 'hour'),
    minutes > 0 && plural(minutes, 'minute'),
  ].filter(Boolean)
  return parts.slice(0, 2).join(' ')
}

export const DURATION_UNITS = [
  { id: 'minutes', label: 'minutes', seconds: MINUTE },
  { id: 'hours', label: 'hours', seconds: HOUR },
  { id: 'days', label: 'days', seconds: DAY },
] as const
export type DurationUnit = (typeof DURATION_UNITS)[number]['id']

/** The largest unit that divides `seconds` evenly, so an unedited request round-trips exactly. */
export function splitDuration(seconds: number): { amount: number; unit: DurationUnit } {
  for (const unit of [...DURATION_UNITS].reverse()) {
    if (seconds % unit.seconds === 0) return { amount: seconds / unit.seconds, unit: unit.id }
  }
  return { amount: seconds / MINUTE, unit: 'minutes' }
}

export function toSeconds(amount: number, unit: DurationUnit): number {
  const found = DURATION_UNITS.find((u) => u.id === unit)
  return amount * (found?.seconds ?? MINUTE)
}

const dateTime = new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' })
const dateOnly = new Intl.DateTimeFormat(undefined, { dateStyle: 'medium' })

export function formatDateTime(iso: string): string {
  return dateTime.format(new Date(iso))
}

export function formatDate(iso: string): string {
  return dateOnly.format(new Date(iso))
}

const relative = new Intl.RelativeTimeFormat(undefined, { numeric: 'auto' })

/** "in 6 days", "2 hours ago". Rounds to the largest sensible unit. */
export function formatRelative(iso: string, now: number = Date.now()): string {
  const diff = (new Date(iso).getTime() - now) / 1000
  const abs = Math.abs(diff)
  if (abs < MINUTE) return relative.format(Math.round(diff), 'second')
  if (abs < HOUR) return relative.format(Math.round(diff / MINUTE), 'minute')
  if (abs < DAY) return relative.format(Math.round(diff / HOUR), 'hour')
  return relative.format(Math.round(diff / DAY), 'day')
}

export function formatHours(hours: AllowedHours): string {
  const hour = (h: number) => `${String(h % 24).padStart(2, '0')}:00`
  return `${hour(hours.startHour)} to ${hour(hours.endHour)} (${hours.zone})`
}

/** "3 reads of 10", "5 reads (no limit)". */
export function formatReads(used: number, max: number | null): string {
  return max === null ? `${plural(used, 'read')}, no limit` : `${used} of ${max} reads`
}
