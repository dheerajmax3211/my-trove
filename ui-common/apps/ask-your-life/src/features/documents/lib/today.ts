import type { TodayItem } from '@platform/workspace-kit'
import type { DocumentResponse } from '../api/types'

/** The most items one product adds to the workspace feed. */
export const MAX_TODAY_ITEMS = 8

const libraryLink = (id: string): string => `/library?open=${encodeURIComponent(id)}`

/**
 * What needs a person's attention in the library: items that failed to index (they cannot be found
 * until they are added again) and items still being indexed (they cannot be found yet). Failures
 * come first. The result depends only on `documents`, so equal input gives equal output.
 */
export function todayItemsFor(documents: readonly DocumentResponse[]): TodayItem[] {
  const failed: TodayItem[] = []
  const indexing: TodayItem[] = []
  for (const doc of documents) {
    if (doc.status === 'FAILED') {
      failed.push({
        id: `failed-${doc.id}`,
        title: `"${doc.title}" could not be indexed`,
        subtitle: 'Search cannot find it. Delete it and add it again.',
        severity: 'warn',
        to: libraryLink(doc.id),
      })
    } else if (doc.status === 'PENDING') {
      indexing.push({
        id: `indexing-${doc.id}`,
        title: `Indexing "${doc.title}"`,
        subtitle: 'It becomes searchable in a few seconds.',
        severity: 'info',
        to: libraryLink(doc.id),
      })
    }
  }
  return [...failed, ...indexing].slice(0, MAX_TODAY_ITEMS)
}
