import { apiQueryKey } from '@platform/api-client'
import type { QueryKey } from '@tanstack/react-query'
import type { Tone } from './types'

export const itemsPath = '/v1/items'
export const itemPath = (id: string) => `${itemsPath}/${encodeURIComponent(id)}`
export const timelinePath = (id: string) => `${itemPath(id)}/timeline`
export const draftPath = (id: string) => `${itemPath(id)}/draft`
export const resolvePath = (id: string) => `${itemPath(id)}/resolve`
export const snoozePath = (id: string) => `${itemPath(id)}/snooze`
export const cancelPath = (id: string) => `${itemPath(id)}/cancel`
export const repliesPath = (id: string) => `${itemPath(id)}/replies`

export const draftQuery = (tone: Tone) => ({ tone })

/** Cache keys to refresh after any change to one item. */
export const itemKeys = {
  list: (): QueryKey => apiQueryKey(itemsPath),
  detail: (id: string): QueryKey => apiQueryKey(itemPath(id)),
  timeline: (id: string): QueryKey => apiQueryKey(timelinePath(id)),
}
