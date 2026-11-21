import { useApiMutation, useApiQuery } from '@platform/api-client'
import type { QueryParams } from '@platform/api-client'
import {
  cancelPath,
  draftPath,
  draftQuery,
  itemKeys,
  itemPath,
  itemsPath,
  resolvePath,
  snoozePath,
  timelinePath,
} from '../api/paths'
import type {
  CreateItemInput,
  Draft,
  Item,
  ItemStatus,
  ResolveInput,
  SnoozeInput,
  TimelineEvent,
  Tone,
} from '../api/types'

export const PAGE_SIZE = 100

export function useItems(statuses: readonly ItemStatus[] | null, limit: number, enabled = true) {
  const query: QueryParams = { limit }
  if (statuses) query.status = statuses
  return useApiQuery<Item[]>(itemsPath, { query, enabled })
}

/** Asks whether the user has any item at all; only runs when `enabled`. */
export function useAnyItems(enabled: boolean) {
  return useApiQuery<Item[]>(itemsPath, { query: { limit: 1 }, enabled })
}

export function useItem(id: string) {
  return useApiQuery<Item>(itemPath(id))
}

export function useTimeline(id: string) {
  return useApiQuery<TimelineEvent[]>(timelinePath(id))
}

export function useDraft(id: string, tone: Tone) {
  return useApiQuery<Draft>(draftPath(id), { query: draftQuery(tone) })
}

export function useCreateItem() {
  return useApiMutation<Item, CreateItemInput>({
    path: itemsPath,
    invalidate: [itemKeys.list()],
  })
}

function invalidateItem(id: string) {
  return [itemKeys.list(), itemKeys.detail(id), itemKeys.timeline(id)]
}

export function useResolveItem(id: string) {
  return useApiMutation<Item, ResolveInput>({
    path: resolvePath(id),
    invalidate: invalidateItem(id),
  })
}

export function useSnoozeItem(id: string) {
  return useApiMutation<Item, SnoozeInput>({
    path: snoozePath(id),
    invalidate: invalidateItem(id),
  })
}

export function useCancelItem(id: string) {
  return useApiMutation<Item, void>({
    path: cancelPath(id),
    body: () => undefined,
    invalidate: invalidateItem(id),
  })
}
