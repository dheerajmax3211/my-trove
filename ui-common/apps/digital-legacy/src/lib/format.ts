const SECOND = 1
const MINUTE = 60 * SECOND
export const HOUR = 60 * MINUTE
export const DAY = 24 * HOUR

function plural(n: number, unit: string): string {
  return `${n} ${unit}${n === 1 ? '' : 's'}`
}

/** "3 days 4 hours": the two largest non-zero units of a length of time. */
export function formatDuration(totalSeconds: number): string {
  const seconds = Math.max(0, Math.round(totalSeconds))
  if (seconds === 0) return '0 seconds'
  const parts: string[] = []
  let rest = seconds
  for (const [size, unit] of [
    [DAY, 'day'],
    [HOUR, 'hour'],
    [MINUTE, 'minute'],
    [SECOND, 'second'],
  ] as const) {
    const n = Math.floor(rest / size)
    rest -= n * size
    if (n > 0) parts.push(plural(n, unit))
    if (parts.length === 2) break
  }
  return parts.join(' ')
}

/** "12d 03h 05m" / "05h 12m 03s": compact, fixed-width countdown. */
export function formatCountdown(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000))
  const d = Math.floor(total / DAY)
  const h = Math.floor((total % DAY) / HOUR)
  const m = Math.floor((total % HOUR) / MINUTE)
  const s = total % MINUTE
  const two = (n: number) => String(n).padStart(2, '0')
  return d > 0 ? `${d}d ${two(h)}h ${two(m)}m` : `${two(h)}h ${two(m)}m ${two(s)}s`
}

export function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return 'never'
  return new Date(iso).toLocaleString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

export function formatBytes(n: number): string {
  if (n < 1024) return `${n} bytes`
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KiB`
  return `${(n / 1024 / 1024).toFixed(2)} MiB`
}

export function msUntil(iso: string | null, now: number): number | null {
  return iso ? new Date(iso).getTime() - now : null
}
