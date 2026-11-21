import type { AccessRequest } from '../api/types'
import { formatDuration } from './format'

const DAY_MS = 86_400_000
/** The gateway lets a request wait this long before it expires on its own. */
export const REQUEST_TTL_MS = 7 * DAY_MS

export function requestExpiresAt(request: Pick<AccessRequest, 'createdAt'>): string {
  return new Date(Date.parse(request.createdAt) + REQUEST_TTL_MS).toISOString()
}

/** One plain sentence: how much of the vault an app asks for, for how long and how often. */
export function describeAsk(
  request: Pick<AccessRequest, 'scopes' | 'durationSeconds' | 'maxReads'>,
): string {
  const parts = request.scopes.length === 1 ? 'one part' : `${request.scopes.length} parts`
  const reads =
    request.maxReads === null
      ? ''
      : `, up to ${request.maxReads} ${request.maxReads === 1 ? 'read' : 'reads'}`
  return `Wants to read ${parts} of your vault for ${formatDuration(request.durationSeconds)}${reads}.`
}
