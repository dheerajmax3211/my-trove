const WHEN = new Intl.DateTimeFormat('en', { dateStyle: 'medium', timeStyle: 'short' })

/** A timestamp for people: "21 Nov 2026, 10:00", or a dash when there is none. */
export function when(value: string | null | undefined): string {
  if (!value) return '—'
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? value : WHEN.format(date)
}

/** Whether a key or endpoint is usable now. */
export function isLive(
  item: { revokedAt?: string | null; disabledAt?: string | null; expiresAt?: string | null },
  now: Date,
): boolean {
  if (item.revokedAt || item.disabledAt) return false
  return !item.expiresAt || new Date(item.expiresAt) > now
}

/** Plain words for a key's state. */
export function keyState(
  key: { revokedAt: string | null; expiresAt: string | null },
  now: Date,
): 'Active' | 'Revoked' | 'Expired' {
  if (key.revokedAt) return 'Revoked'
  if (key.expiresAt && new Date(key.expiresAt) <= now) return 'Expired'
  return 'Active'
}

/** Plain words for a delivery's state, as the log shows them. */
export function deliveryLabel(status: string): string {
  switch (status) {
    case 'DELIVERED':
      return 'Delivered'
    case 'PENDING':
      return 'Waiting to send'
    case 'DEAD':
      return 'Gave up'
    default:
      return status
  }
}
