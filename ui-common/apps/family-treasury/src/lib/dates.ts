/** Date helpers. The backend works in UTC; people think in their local day, so filters convert explicitly. */

/** Today's date in UTC as yyyy-mm-dd (allowance start dates are validated against UTC "today"). */
export function utcToday(now: Date = new Date()): string {
  return now.toISOString().slice(0, 10)
}

/** Start of the given local calendar day as an ISO instant (inclusive lower bound). */
export function localDayStartIso(day: string): string {
  const [y, m, d] = day.split('-').map(Number) as [number, number, number]
  return new Date(y, m - 1, d).toISOString()
}

/** Start of the day AFTER the given local day (the backend's `to` is exclusive). */
export function localDayEndExclusiveIso(day: string): string {
  const [y, m, d] = day.split('-').map(Number) as [number, number, number]
  return new Date(y, m - 1, d + 1).toISOString()
}

const dateTime = new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' })
const dateOnly = new Intl.DateTimeFormat(undefined, { dateStyle: 'medium' })
const dayUtc = new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeZone: 'UTC' })

export const formatDateTime = (iso: string): string => dateTime.format(new Date(iso))
export const formatDate = (iso: string): string => dateOnly.format(new Date(iso))

/** A yyyy-mm-dd calendar date (no time zone), shown as the same day everywhere. */
export const formatCalendarDate = (day: string): string =>
  dayUtc.format(new Date(`${day}T00:00:00Z`))

/** "in 2 days", "in 5 hours", "3 hours ago": for approval expiry. */
export function formatRelative(iso: string, now: Date): string {
  const ms = new Date(iso).getTime() - now.getTime()
  const abs = Math.abs(ms)
  const rtf = new Intl.RelativeTimeFormat(undefined, { numeric: 'auto' })
  const minutes = Math.round(abs / 60_000)
  const sign = ms < 0 ? -1 : 1
  if (minutes < 60) return rtf.format(sign * Math.max(minutes, 1), 'minute')
  const hours = Math.round(minutes / 60)
  if (hours < 48) return rtf.format(sign * hours, 'hour')
  return rtf.format(sign * Math.round(hours / 24), 'day')
}
