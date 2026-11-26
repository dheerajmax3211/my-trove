import { describe, expect, it } from 'vitest'
import { MAX_RECENT, pushRecent } from './recentSearches'

describe('pushRecent', () => {
  it('puts the newest first and drops repeats, ignoring case and spacing', () => {
    expect(pushRecent(['b', 'a'], 'a')).toEqual(['a', 'b'])
    expect(pushRecent(['Car  Insurance', 'x'], ' car insurance ')).toEqual(['car insurance', 'x'])
  })

  it('ignores blank queries and keeps at most MAX_RECENT', () => {
    expect(pushRecent(['a'], '   ')).toEqual(['a'])
    const many = Array.from({ length: MAX_RECENT }, (_, i) => `q${i}`)
    const next = pushRecent(many, 'fresh')
    expect(next).toHaveLength(MAX_RECENT)
    expect(next[0]).toBe('fresh')
    expect(next).not.toContain(`q${MAX_RECENT - 1}`)
  })
})
