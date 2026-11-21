import { useApiQuery } from '@platform/api-client'
import {
  buildSearchParams,
  dateRangeError,
  MAX_QUERY_LENGTH,
  SEARCH_PATH,
  type SearchState,
} from '../api/searchApi'
import type { SearchResponse } from '../api/types'

/** Runs the search described by `state`. Idle until there is a query and a valid date range. */
export function useSearch(state: SearchState) {
  const q = state.q.trim()
  const enabled = q !== '' && q.length <= MAX_QUERY_LENGTH && dateRangeError(state) === null
  return useApiQuery<SearchResponse>(SEARCH_PATH, {
    query: buildSearchParams(state),
    enabled,
  })
}
