/** Small, pure formatting helpers. Locale is the browser's; nothing here reads the clock. */

const MS_MIN = 60_000
const MS_HOUR = 60 * MS_MIN
const MS_DAY = 24 * MS_HOUR

export function formatWatts(watts: number): string {
  const digits = Math.abs(watts) < 10 ? 1 : 0
  return `${watts.toLocaleString(undefined, { maximumFractionDigits: digits, minimumFractionDigits: digits })} W`
}

export function formatKwh(kwh: number): string {
  return `${kwh.toLocaleString(undefined, { maximumFractionDigits: 2 })} kWh`
}

export function formatPercent(value: number, digits = 0): string {
  return `${value.toLocaleString(undefined, { maximumFractionDigits: digits })}%`
}

export function pluralize(count: number, singular: string, plural = `${singular}s`): string {
  return `${count.toLocaleString()} ${count === 1 ? singular : plural}`
}

/** "14 h 20 min", "45 min", "2 d 3 h". Rounds to whole minutes. */
export function formatDuration(minutes: number): string {
  const total = Math.max(0, Math.round(minutes))
  if (total < 1) return 'under a minute'
  const d = Math.floor(total / 1440)
  const h = Math.floor((total % 1440) / 60)
  const m = total % 60
  if (d > 0) return h > 0 ? `${d} d ${h} h` : `${d} d`
  if (h > 0) return m > 0 ? `${h} h ${m} min` : `${h} h`
  return `${m} min`
}

/** Parses `YYYY-MM-DD` as a local calendar date (no UTC shift). */
export function parseLocalDate(value: string): Date {
  const [y, m, d] = value.split('-').map(Number)
  return new Date(y ?? 1970, (m ?? 1) - 1, d ?? 1)
}

export function formatDate(value: string | null | undefined): string {
  if (!value) return 'Not set'
  return parseLocalDate(value).toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  })
}

export function formatDateTime(value: string | Date | null | undefined): string {
  if (!value) return 'Never'
  const date = typeof value === 'string' ? new Date(value) : value
  return date.toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

/** "just now", "5 min ago", "3 h ago", "2 days ago". `null` means the thing never happened. */
export function formatRelative(value: string | null | undefined, now: Date): string {
  if (!value) return 'Never'
  const diff = now.getTime() - new Date(value).getTime()
  if (diff < MS_MIN) return 'Just now'
  if (diff < MS_HOUR) return `${Math.floor(diff / MS_MIN)} min ago`
  if (diff < MS_DAY) return `${Math.floor(diff / MS_HOUR)} h ago`
  const days = Math.floor(diff / MS_DAY)
  return days === 1 ? '1 day ago' : `${days} days ago`
}

/** Relative wording for a number of days from today: negative is overdue. */
export function formatDaysUntil(days: number): string {
  if (days === 0) return 'today'
  if (days === 1) return 'tomorrow'
  if (days > 1) return `in ${days} days`
  if (days === -1) return '1 day overdue'
  return `${Math.abs(days)} days overdue`
}

/** Local calendar date as `YYYY-MM-DD` (what <input type="date"> and the API use). */
export function toDateInputValue(date: Date): string {
  const mm = String(date.getMonth() + 1).padStart(2, '0')
  const dd = String(date.getDate()).padStart(2, '0')
  return `${date.getFullYear()}-${mm}-${dd}`
}
