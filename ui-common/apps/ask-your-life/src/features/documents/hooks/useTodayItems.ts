import type { TodayItem } from '@platform/workspace-kit'
import { useMemo } from 'react'
import { todayItemsFor } from '../lib/today'
import { useDocumentList } from './useDocuments'

/**
 * Workspace "Today" feed: documents that failed to index or are still indexing. It reads the same
 * first library page as the Library screen (one cache entry) and re-checks while anything is pending.
 * The returned array only changes when the documents do.
 */
export function useTodayItems(): { items: TodayItem[]; loading: boolean } {
  const list = useDocumentList(null, 0)
  const items = useMemo(() => todayItemsFor(list.data ?? []), [list.data])
  return { items, loading: list.isPending }
}
