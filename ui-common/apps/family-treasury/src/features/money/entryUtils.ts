import type { EntryView, EntryKind } from '../../api/types'

export const KIND_LABEL: Record<EntryKind, string> = {
  DEPOSIT: 'Deposit',
  SPEND: 'Spend',
  TRANSFER: 'Transfer',
  SPLIT: 'Split',
  REVERSAL: 'Reversal',
  ALLOWANCE: 'Allowance',
}

export interface EntrySummary {
  /** Total moved: the sum of the debit (positive) postings. */
  movedMinor: number
  from: string
  to: string
}

/** One line of "who paid whom" for an entry, using account names. */
export function summarizeEntry(
  entry: EntryView,
  accountName: (id: string) => string,
): EntrySummary {
  const names = (sign: 1 | -1) =>
    entry.postings
      .filter((p) => Math.sign(p.amountMinor) === sign)
      .map((p) => accountName(p.accountId))
      .join(', ')
  const movedMinor = entry.postings
    .filter((p) => p.amountMinor > 0)
    .reduce((s, p) => s + p.amountMinor, 0)
  return { movedMinor, from: names(-1), to: names(1) }
}

/** ids of entries that some other entry reverses. */
export function reversedIds(entries: readonly EntryView[]): Set<string> {
  return new Set(entries.flatMap((e) => (e.reversesEntryId ? [e.reversesEntryId] : [])))
}
