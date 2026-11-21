import { describe, expect, it } from 'vitest'
import {
  buildSearchParams,
  dateRangeError,
  EMPTY_SEARCH,
  hasActiveFilters,
  localDayToInstant,
  paramsFromState,
  searchUrl,
  stateFromParams,
  type SearchState,
} from './searchApi'

const base: SearchState = { ...EMPTY_SEARCH, q: '  smoke detector  ' }

describe('search query string', () => {
  it('sends the trimmed query, k, mode and debug for the explain popover', () => {
    expect(searchUrl(base)).toBe('/v1/search?q=smoke+detector&k=10&mode=hybrid&debug=true')
  })

  it.each(['hybrid', 'keyword', 'semantic'] as const)('passes mode %s through', (mode) => {
    expect(searchUrl({ ...base, mode })).toContain(`mode=${mode}`)
  })

  it('repeats sourceType once per selected type, in a stable order', () => {
    const url = searchUrl({ ...base, sourceTypes: ['RECEIPT', 'NOTE'] })
    expect(url).toContain('sourceType=NOTE&sourceType=RECEIPT')
  })

  it('turns an inclusive date range into [start of from, start of the day after to)', () => {
    const params = buildSearchParams({ ...base, from: '2026-03-01', to: '2026-03-31' })
    expect(params.from).toBe(new Date(2026, 2, 1).toISOString())
    expect(params.to).toBe(new Date(2026, 3, 1).toISOString())
  })

  it('handles month and year rollover for the exclusive end', () => {
    expect(localDayToInstant('2026-12-31', 1)).toBe(new Date(2027, 0, 1).toISOString())
  })

  it('omits empty filters and clamps k to 1..50', () => {
    const params = buildSearchParams({ ...base, k: 500 })
    expect(params).toEqual({ q: 'smoke detector', k: 50, mode: 'hybrid', debug: true })
    expect(buildSearchParams({ ...base, k: 0 }).k).toBe(1)
  })

  it('rejects malformed dates', () => {
    expect(localDayToInstant('03/01/2026')).toBeNull()
  })
})

describe('date range validation', () => {
  it('flags a start after the end, allows the same day', () => {
    expect(dateRangeError({ from: '2026-05-02', to: '2026-05-01' })).toMatch(/after/)
    expect(dateRangeError({ from: '2026-05-01', to: '2026-05-01' })).toBeNull()
    expect(dateRangeError({ from: '', to: '2026-05-01' })).toBeNull()
  })

  it('detects active filters', () => {
    expect(hasActiveFilters(base)).toBe(false)
    expect(hasActiveFilters({ ...base, from: '2026-01-01' })).toBe(true)
    expect(hasActiveFilters({ ...base, sourceTypes: ['FILE'] })).toBe(true)
  })
})

describe('address bar state', () => {
  it('round-trips, writing only non-default values', () => {
    const state: SearchState = {
      q: 'lease',
      mode: 'keyword',
      sourceTypes: ['FILE', 'EMAIL'],
      from: '2026-01-01',
      to: '2026-02-01',
      k: 20,
    }
    const params = paramsFromState(state)
    expect(params.toString()).toBe(
      'q=lease&mode=keyword&type=FILE&type=EMAIL&from=2026-01-01&to=2026-02-01&k=20',
    )
    expect(stateFromParams(params)).toEqual(state)
    expect(paramsFromState({ ...EMPTY_SEARCH, q: 'a' }).toString()).toBe('q=a')
  })

  it('ignores junk in the address', () => {
    const state = stateFromParams(
      new URLSearchParams('q=x&mode=bogus&type=NOPE&from=yesterday&k=9999'),
    )
    expect(state).toEqual({ ...EMPTY_SEARCH, q: 'x' })
  })
})
