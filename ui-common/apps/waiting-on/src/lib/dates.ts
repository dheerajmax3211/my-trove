const MS_PER_DAY = 86_400_000

const locale = (): string =>
  typeof navigator !== 'undefined' && navigator.language ? navigator.language : 'en-US'

/** Parse `YYYY-MM-DD` as a calendar date in local time (never shifted by the time zone). */
export function parseCalendarDate(value: string): Date | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value)
  if (!match) return null
  const [year, month, day] = [Number(match[1]), Number(match[2]), Number(match[3])]
  const date = new Date(year, month - 1, day)
  const valid =
    date.getFullYear() === year && date.getMonth() === month - 1 && date.getDate() === day
  return valid ? date : null
}

/** `YYYY-MM-DD` of a date in local time. */
export function toCalendarDate(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
}

export function addDays(date: Date, days: number): Date {
  const next = new Date(date.getTime())
  next.setDate(next.getDate() + days)
  return next
}

/** Whole calendar days from `from` to `to` (negative when `to` is earlier), ignoring the time of day. */
export function calendarDaysBetween(from: Date, to: Date): number {
  const a = Date.UTC(from.getFullYear(), from.getMonth(), from.getDate())
  const b = Date.UTC(to.getFullYear(), to.getMonth(), to.getDate())
  return Math.round((b - a) / MS_PER_DAY)
}

export function formatDate(date: Date): string {
  return new Intl.DateTimeFormat(locale(), {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  }).format(date)
}

export function formatDateTime(date: Date): string {
  return new Intl.DateTimeFormat(locale(), {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(date)
}

/** "today", "tomorrow", "in 3 days", "yesterday", "5 days ago". */
export function describeDayOffset(days: number): string {
  if (days === 0) return 'today'
  if (days === 1) return 'tomorrow'
  if (days === -1) return 'yesterday'
  return days > 0 ? `in ${days} days` : `${-days} days ago`
}

export function pluralDays(days: number): string {
  return `${days} ${days === 1 ? 'day' : 'days'}`
}
