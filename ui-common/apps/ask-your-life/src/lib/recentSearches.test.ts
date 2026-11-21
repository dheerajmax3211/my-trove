import { describe, expect, it } from 'vitest'
import { runtimeFor } from '../test/runtimeFor'
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

describe('demo runtime', () => {
  it('starts with the sample library, or an empty one with ?empty=1', async () => {
    const headers = { authorization: 'Bearer demo' }
    const count = async (search: string) => {
      const runtime = runtimeFor(search)
      const response = await runtime.mock?.fetch('http://localhost/api/v1/documents', { headers })
      return ((await response?.json()) as unknown[]).length
    }
    expect(await count('')).toBeGreaterThan(0)
    expect(await count('?empty=1')).toBe(0)
  })
})
