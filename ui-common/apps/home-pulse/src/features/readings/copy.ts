import { formatDuration, formatKwh, formatWatts, pluralize } from '../../lib/format'
import type { CsvImportResult, MeterReadingResult, ReadingSource } from './types'

/** Short name of a source, for badges. */
export const SOURCE_LABELS: Record<ReadingSource, string> = {
  DEVICE: 'Smart plug',
  MANUAL: 'Entered by you',
  SIMULATED: 'Simulated',
}

/** One sentence on where the numbers on a chart come from. `period` is the range in words, e.g. "last 24 hours". */
export function sourceSentence(source: ReadingSource | null | undefined, period: string): string {
  switch (source) {
    case 'SIMULATED':
      return `Simulated watts, ${period}. These numbers are invented by the simulator. They are not this appliance's.`
    case 'MANUAL':
      return `Entered by you, ${period}. Each point is the average power over the interval between two of your entries, not a minute-by-minute measurement.`
    case 'DEVICE':
      return `Watts reported by the smart plug, ${period}.`
    default:
      return `No live source for this appliance, so nothing to show for the ${period}.`
  }
}

/** The line that tells the owner what a meter entry turned into. */
export function describeMeterResult(result: MeterReadingResult): string {
  if (result.outcome === 'BASELINE') {
    return 'Saved as the starting point. Enter the total again later: the energy used in between becomes average power.'
  }
  const minutes = result.minutesStored
  const stored = `Added ${pluralize(minutes, 'minute')} at an average of ${formatWatts(result.averageWatts ?? 0)}`
  const span = `${formatKwh(result.energyKwh)} over ${formatDuration(result.intervalMinutes)}`
  const rejected =
    result.minutesRejected > 0
      ? ` ${pluralize(result.minutesRejected, 'minute')} fell outside the 30 days Home Pulse accepts, so they were not stored.`
      : ''
  return `${stored} (${span}).${rejected}`
}

/** The line that tells the owner what a CSV import did. */
export function describeImport(result: CsvImportResult): string {
  const parts = [`Imported ${pluralize(result.accepted, 'reading')}.`]
  if (result.duplicates > 0)
    parts.push(
      `${pluralize(result.duplicates, 'reading')} ${result.duplicates === 1 ? 'was' : 'were'} already there.`,
    )
  if (result.rejected > 0)
    parts.push(
      `${pluralize(result.rejected, 'reading')} fell outside the 30 days Home Pulse accepts, so ${result.rejected === 1 ? 'it was' : 'they were'} not stored.`,
    )
  return parts.join(' ')
}
