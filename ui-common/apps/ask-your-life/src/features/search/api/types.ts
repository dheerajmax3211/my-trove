import type { SourceType } from '../../documents/api/types'

/** Typed mirror of SearchHit / SearchService.Response (ask-your-life search package). */

export const SEARCH_MODES = ['hybrid', 'keyword', 'semantic'] as const
export type SearchMode = (typeof SEARCH_MODES)[number]

export interface SearchExplain {
  /** 1-based position in the keyword list, null when the passage is not in it. */
  ftsRank: number | null
  /** 1-based position in the meaning list, null when the passage is not in it. */
  semanticRank: number | null
  ftsScore: number | null
  /** Cosine similarity, 0 to 1. */
  semanticSimilarity: number | null
}

export interface SearchHit {
  documentId: string
  chunkId: string
  title: string
  sourceType: SourceType
  createdAt: string
  /** 0-based index of the best-matching passage within the document. */
  chunkOrdinal: number
  /** Escaped text; matches are wrapped in <mark>...</mark>. Never render it as HTML. */
  snippet: string
  score: number
  explain?: SearchExplain | null
}

export interface SearchDebug {
  rrfK: number
  fusion: string
  candidatePool: number
}

/** One sentence quoted verbatim from a document, with where it comes from. */
export interface AnswerCitation {
  text: string
  documentId: string
  title: string
  sourceType: SourceType
  chunkId: string
  /** 0-based passage index within the document. */
  chunkOrdinal: number
}

/**
 * Extractive answer: the best-matching sentence(s) of the top results, quoted, never generated. Absent when no
 * sentence matches well enough.
 */
export interface SearchAnswer {
  /** The cited sentences joined by a space. Plain text: render as text, never as HTML. */
  text: string
  sentences: AnswerCitation[]
  score: number
}

export interface SearchResponse {
  query: string
  /** The backend echoes the enum name, upper case. */
  mode: string
  k: number
  answer?: SearchAnswer | null
  hits: SearchHit[]
  debug?: SearchDebug | null
}
