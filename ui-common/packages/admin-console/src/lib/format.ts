const INT = new Intl.NumberFormat('en-US')
const COMPACT = new Intl.NumberFormat('en-US', { notation: 'compact', maximumFractionDigits: 1 })

export const formatInt = (n: number): string => INT.format(Math.round(n))
export const formatCompact = (n: number): string =>
  Math.abs(n) < 10_000 ? formatInt(n) : COMPACT.format(n)

/** 0.0123 -> "1.23%"; tiny non-zero rates are not rounded to "0%". */
export function formatPercent(ratio: number): string {
  if (!Number.isFinite(ratio) || ratio <= 0) return '0%'
  const pct = ratio * 100
  if (pct < 0.01) return '<0.01%'
  if (pct < 10) return `${pct.toFixed(2).replace(/0$/, '')}%`
  return `${pct.toFixed(1).replace(/\.0$/, '')}%`
}

export function formatMs(ms: number | null | undefined): string {
  if (ms === null || ms === undefined || !Number.isFinite(ms)) return 'n/a'
  if (ms >= 1000) return `${(ms / 1000).toFixed(2).replace(/0$/, '')} s`
  return `${Math.round(ms)} ms`
}

export function shortId(id: string): string {
  return id.length > 8 ? id.slice(0, 8) : id
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
export const isUuid = (value: string): boolean => UUID.test(value.trim())

const DATE_TIME = new Intl.DateTimeFormat('en-GB', {
  day: 'numeric',
  month: 'short',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
})
export function formatDateTime(iso: string): string {
  const d = new Date(iso)
  return Number.isNaN(d.getTime()) ? iso : DATE_TIME.format(d)
}

export function formatRelative(iso: string, now: Date = new Date()): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso
  const seconds = Math.round((now.getTime() - d.getTime()) / 1000)
  if (seconds < 45) return 'just now'
  const minutes = Math.round(seconds / 60)
  if (minutes < 60) return `${minutes} min ago`
  const hours = Math.round(minutes / 60)
  if (hours < 24) return `${hours} h ago`
  const days = Math.round(hours / 24)
  if (days < 30) return `${days} d ago`
  return formatDateTime(iso)
}

export function chunk<T>(items: readonly T[], size: number): T[][] {
  const out: T[][] = []
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size))
  return out
}
