import type { AccessRequest } from '../api/types'
import { formatDuration } from './format'

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
