const dateTime = new Intl.DateTimeFormat(undefined, {
  dateStyle: 'medium',
  timeStyle: 'short',
})
const dateOnly = new Intl.DateTimeFormat(undefined, { dateStyle: 'medium' })

export function formatDateTime(iso: string): string {
  return dateTime.format(new Date(iso))
}

export function formatDate(iso: string): string {
  return dateOnly.format(new Date(iso))
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  const units = ['KB', 'MB', 'GB']
  let value = bytes / 1024
  let unit = 0
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024
    unit += 1
  }
  return `${value >= 10 ? Math.round(value) : Math.round(value * 10) / 10} ${units[unit]}`
}

const relative = new Intl.RelativeTimeFormat(undefined, { numeric: 'auto' })

/** "in 3 days", "2 hours ago", "tomorrow". `nowMs` is passed in so it follows the app clock. */
export function formatRelative(iso: string, nowMs: number): string {
  const diffSeconds = (new Date(iso).getTime() - nowMs) / 1000
  const abs = Math.abs(diffSeconds)
  if (abs < 60) return relative.format(Math.round(diffSeconds), 'second')
  if (abs < 3600) return relative.format(Math.round(diffSeconds / 60), 'minute')
  if (abs < 86_400) return relative.format(Math.round(diffSeconds / 3600), 'hour')
  return relative.format(Math.round(diffSeconds / 86_400), 'day')
}

const pad = (n: number) => String(n).padStart(2, '0')

/** ISO instant -> value for `<input type="datetime-local">` (local wall-clock time). */
export function toLocalInputValue(iso: string): string {
  const d = new Date(iso)
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

/** `datetime-local` value -> ISO instant, or null when empty or not a real date. */
export function fromLocalInputValue(value: string): string | null {
  if (!value) return null
  const d = new Date(value)
  return Number.isNaN(d.getTime()) ? null : d.toISOString()
}

/** Long ids (Firebase uids, UUIDs) shortened for tables; the full value stays in a title/tooltip. */
export function shortId(id: string): string {
  return id.length > 14 ? `${id.slice(0, 8)}...${id.slice(-4)}` : id
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
export const isUuid = (value: string): boolean => UUID.test(value.trim())
