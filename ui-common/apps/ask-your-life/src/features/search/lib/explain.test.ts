import { describe, expect, it } from 'vitest'
import type { SearchHit } from '../api/types'
import { explainHit } from './explain'

const hit = (explain: SearchHit['explain'], score = 0.0323): SearchHit => ({
  documentId: 'd',
  chunkId: 'c',
  title: 'T',
  sourceType: 'NOTE',
  createdAt: '2026-01-01T00:00:00Z',
  chunkOrdinal: 2,
  snippet: '',
  score,
  explain,
})

const debug = { rrfK: 60, fusion: '', candidatePool: 100 }

describe('explainHit', () => {
  it('explains a hit found by both lists with the fusion arithmetic', () => {
    const e = explainHit(
      hit({ ftsRank: 2, semanticRank: 5, ftsScore: 0.4, semanticSimilarity: 0.71 }),
      'hybrid',
      debug,
    )
    expect(e.summary).toMatch(/both your exact words and similar wording/)
    expect(e.details.join(' ')).toContain('ranks 2nd among keyword matches')
    expect(e.details.join(' ')).toContain('ranks 5th on that list (similarity 71 out of 100)')
    expect(e.details.join(' ')).toContain('passage 3 of the document')
    expect(e.scoreLine).toBe(
      'Score 0.0323 = 1/(60 + 2) + 1/(60 + 5). Higher is better; a passage found by both lists scores highest.',
    )
  })

  it('says so when only one list found it', () => {
    const keywordOnly = explainHit(
      hit({ ftsRank: 1, semanticRank: null, ftsScore: 1, semanticSimilarity: null }),
      'hybrid',
      debug,
    )
    expect(keywordOnly.summary).toMatch(/your exact words only/)
    expect(keywordOnly.details.join(' ')).toMatch(/wording was not similar enough/)
    const meaningOnly = explainHit(
      hit({ ftsRank: null, semanticRank: 3, ftsScore: null, semanticSimilarity: 0.3 }),
      'hybrid',
      debug,
    )
    expect(meaningOnly.summary).toMatch(/similar wording only/)
  })

  it('only talks about the list the mode uses', () => {
    const keyword = explainHit(
      hit({ ftsRank: 4, semanticRank: null, ftsScore: 1, semanticSimilarity: null }),
      'keyword',
      debug,
    )
    expect(keyword.details.join(' ')).not.toMatch(/Similar-wording match/)
    const semantic = explainHit(
      hit({ ftsRank: null, semanticRank: 1, ftsScore: null, semanticSimilarity: 0.9 }),
      'semantic',
      null,
    )
    expect(semantic.details.join(' ')).not.toMatch(/Keyword match/)
    expect(semantic.scoreLine).toContain('1/(60 + 1)')
  })

  it('copes with a response that has no debug data', () => {
    expect(explainHit(hit(undefined), 'hybrid', undefined).summary).toBe('Matched your search.')
  })
})
