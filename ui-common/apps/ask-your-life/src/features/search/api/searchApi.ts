import { apiQueryKey, buildUrl, type QueryParams } from '@platform/api-client'
import { SOURCE_TYPES, type SourceType } from '../../documents/api/types'
import type { SearchMode } from './types'

export const SEARCH_PATH = '/v1/search'
export const DEFAULT_K = 10
export const MAX_K = 50
export const MAX_QUERY_LENGTH = 500

/** Everything the search screen can ask for. It is also what the URL carries. */
export interface SearchState {
  q: string
  mode: SearchMode
  sourceTypes: readonly SourceType[]
  /** `YYYY-MM-DD` (local date) or empty. Inclusive. */
  from: string
  /** `YYYY-MM-DD` (local date) or empty. Inclusive: the query sends the start of the next day. */
  to: string
  k: number
}

export const EMPTY_SEARCH: SearchState = {
  q: '',
  mode: 'hybrid',
  sourceTypes: [],
  from: '',
  to: '',
  k: DEFAULT_K,
}

const DATE_ONLY = /^(\d{4})-(\d{2})-(\d{2})$/

/** Start of a local calendar day (plus `plusDays`) as an ISO-8601 instant, or null for bad input. */
export function localDayToInstant(date: string, plusDays = 0): string | null {
  const match = DATE_ONLY.exec(date)
  if (!match) return null
  const [, y, m, d] = match
  const parsed = new Date(Number(y), Number(m) - 1, Number(d) + plusDays)
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString()
}

export function hasActiveFilters(state: SearchState): boolean {
  return state.sourceTypes.length > 0 || state.from !== '' || state.to !== ''
}

/** A message when the date range cannot be searched, else null. */
export function dateRangeError(state: Pick<SearchState, 'from' | 'to'>): string | null {
  if (state.from && state.to && state.from > state.to)
    return 'The start date is after the end date.'
  return null
}

/**
 * The exact query parameters for `GET /v1/search`. Always asks for `debug=true` so every hit
 * carries the ranks that power "Why this result". `to` is exclusive on the server, so an inclusive
 * end date becomes the start of the following day.
 */
export function buildSearchParams(state: SearchState): QueryParams {
  const from = state.from ? localDayToInstant(state.from) : null
  const to = state.to ? localDayToInstant(state.to, 1) : null
  const types = SOURCE_TYPES.filter((t) => state.sourceTypes.includes(t))
  return {
    q: state.q.trim(),
    k: Math.min(Math.max(state.k, 1), MAX_K),
    mode: state.mode,
    ...(types.length > 0 ? { sourceType: types } : {}),
    ...(from ? { from } : {}),
    ...(to ? { to } : {}),
    debug: true,
  }
}

/** The request path + query string as it goes over the wire (handy for tests and debugging). */
export function searchUrl(state: SearchState): string {
  return buildUrl('', SEARCH_PATH, buildSearchParams(state))
}

export const searchKeyFor = (state: SearchState) =>
  apiQueryKey(SEARCH_PATH, buildSearchParams(state))

// ---- URL <-> state ----------------------------------------------------------------------------

const isMode = (value: string | null): value is SearchMode =>
  value === 'hybrid' || value === 'keyword' || value === 'semantic'

export function stateFromParams(params: URLSearchParams): SearchState {
  const mode = params.get('mode')
  const k = Number(params.get('k'))
  const types = params
    .getAll('type')
    .filter((t): t is SourceType => (SOURCE_TYPES as readonly string[]).includes(t))
  return {
    q: (params.get('q') ?? '').slice(0, MAX_QUERY_LENGTH),
    mode: isMode(mode) ? mode : 'hybrid',
    sourceTypes: SOURCE_TYPES.filter((t) => types.includes(t)),
    from: DATE_ONLY.test(params.get('from') ?? '') ? (params.get('from') ?? '') : '',
    to: DATE_ONLY.test(params.get('to') ?? '') ? (params.get('to') ?? '') : '',
    k: Number.isInteger(k) && k >= 1 && k <= MAX_K ? k : DEFAULT_K,
  }
}

/** Only non-default values go in the address bar, so a plain search stays `?q=...`. */
export function paramsFromState(state: SearchState): URLSearchParams {
  const params = new URLSearchParams()
  if (state.q.trim()) params.set('q', state.q.trim())
  if (state.mode !== 'hybrid') params.set('mode', state.mode)
  state.sourceTypes.forEach((t) => params.append('type', t))
  if (state.from) params.set('from', state.from)
  if (state.to) params.set('to', state.to)
  if (state.k !== DEFAULT_K) params.set('k', String(state.k))
  return params
}
