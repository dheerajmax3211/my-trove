import type { SearchDebug, SearchHit, SearchMode } from '../api/types'

export interface Explanation {
  /** One sentence summing up why the result is here. */
  summary: string
  /** Where it landed in each list, in plain words. */
  details: string[]
  /** How the final score was put together. */
  scoreLine: string
}

const DEFAULT_RRF_K = 60

const ordinal = (n: number): string => {
  const rest = n % 100
  if (rest >= 11 && rest <= 13) return `${n}th`
  switch (n % 10) {
    case 1:
      return `${n}st`
    case 2:
      return `${n}nd`
    case 3:
      return `${n}rd`
    default:
      return `${n}th`
  }
}

const formatScore = (n: number): string => n.toFixed(4)

/**
 * Turns the backend's debug data (ranks in each list, similarity, fusion parameters) into plain
 * language. Hybrid search runs a keyword list and a meaning list and fuses them by rank:
 * score = 1/(k + keywordRank) + 1/(k + meaningRank), skipping a list the passage is not in.
 */
export function explainHit(
  hit: SearchHit,
  mode: SearchMode,
  debug: SearchDebug | null | undefined,
): Explanation {
  const k = debug?.rrfK ?? DEFAULT_RRF_K
  const keyword = hit.explain?.ftsRank ?? null
  const meaning = hit.explain?.semanticRank ?? null
  const similarity = hit.explain?.semanticSimilarity ?? null
  const details: string[] = []

  if (mode !== 'semantic') {
    details.push(
      keyword === null
        ? 'Keyword match: this passage did not contain your words, so it is not in the keyword list.'
        : `Keyword match: it contains your words and ranks ${ordinal(keyword)} among keyword matches.`,
    )
  }
  if (mode !== 'keyword') {
    details.push(
      meaning === null
        ? 'Meaning match: it was not close enough in meaning to make the meaning list.'
        : `Meaning match: it reads like your search and ranks ${ordinal(meaning)} by meaning${
            similarity === null ? '' : ` (similarity ${Math.round(similarity * 100)} out of 100)`
          }.`,
    )
  }
  details.push(`This is passage ${hit.chunkOrdinal + 1} of the document, its best match.`)

  const parts: string[] = []
  if (mode !== 'semantic' && keyword !== null) parts.push(`1/(${k} + ${keyword})`)
  if (mode !== 'keyword' && meaning !== null) parts.push(`1/(${k} + ${meaning})`)
  const scoreLine =
    parts.length === 0
      ? `Score ${formatScore(hit.score)}.`
      : `Score ${formatScore(hit.score)} = ${parts.join(' + ')}. Higher is better; a passage found by both lists scores highest.`

  let summary: string
  if (mode === 'hybrid') {
    if (keyword !== null && meaning !== null)
      summary = 'Found by both keywords and meaning, which is why it ranks well.'
    else if (keyword !== null)
      summary = 'Found by keywords only. Nothing close in meaning backed it up.'
    else if (meaning !== null)
      summary = 'Found by meaning only. It does not contain your exact words.'
    else summary = 'Matched your search.'
  } else if (mode === 'keyword') {
    summary = 'Found because it contains your words.'
  } else {
    summary = 'Found because it reads like your search, even if the words differ.'
  }

  return { summary, details, scoreLine }
}
