/**
 * A tiny search engine that behaves like the real one closely enough to demo and test the UI:
 * keyword = stemmed AND/OR/-exclude/"phrase" matching, semantic = similarity over concept groups
 * (so "vehicle" finds "car"), hybrid = reciprocal rank fusion of the two with k = 60.
 */

export type Mode = 'hybrid' | 'keyword' | 'semantic'

export interface Passage {
  documentId: string
  ordinal: number
  text: string
}

export interface Candidate {
  passage: Passage
  ftsRank: number | null
  semanticRank: number | null
  ftsScore: number | null
  semanticSimilarity: number | null
  score: number
  stems: ReadonlySet<string>
}

const RRF_K = 60
const MIN_SIMILARITY = 0.2

const STOPWORDS = new Set(
  'a an and are as at be by did do for from how i in is it me my of on or say the to was what when where which who with'.split(
    ' ',
  ),
)

/** Words that mean roughly the same thing share a concept. */
const CONCEPTS: readonly (readonly string[])[] = [
  ['car', 'automobile', 'vehicle', 'auto', 'sedan'],
  ['receipt', 'invoice', 'bill', 'purchase'],
  ['deposit', 'retainer', 'escrow'],
  ['lease', 'rental', 'tenancy', 'rent', 'landlord'],
  ['insurance', 'policy', 'coverage', 'insure'],
  ['doctor', 'physician', 'clinic', 'dentist'],
  ['trip', 'holiday', 'vacation', 'travel', 'journey', 'flight'],
  ['repair', 'fix', 'maintenance', 'service'],
  ['money', 'cost', 'price', 'paid', 'total', 'amount', 'payment', 'dollar'],
  ['tax', 'taxes', 'irs', 'refund'],
]

const conceptOf = new Map<string, string>(
  CONCEPTS.flatMap((group) =>
    group.map((word) => [stem(word), `concept:${stem(group[0] ?? word)}`]),
  ),
)

export function stem(word: string): string {
  const w = word.toLowerCase()
  if (w.length > 5 && w.endsWith('ing')) return w.slice(0, -3)
  if (w.length > 4 && w.endsWith('ies')) return `${w.slice(0, -3)}y`
  if (w.length > 4 && w.endsWith('es')) return w.slice(0, -2)
  if (w.length > 4 && w.endsWith('ed')) return w.slice(0, -2)
  if (w.length > 3 && w.endsWith('s') && !w.endsWith('ss')) return w.slice(0, -1)
  return w
}

const words = (text: string): string[] => text.toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? []

interface ParsedQuery {
  /** Alternatives joined by "or"; a passage must contain every stem of at least one group. */
  groups: string[][]
  phrases: string[]
  excluded: string[]
  /** Every stem that may be highlighted. */
  highlight: Set<string>
}

export function parseQuery(q: string): ParsedQuery {
  const phrases: string[] = []
  const rest = q.replace(/"([^"]+)"/g, (_m, phrase: string) => {
    phrases.push(phrase.toLowerCase().trim())
    return ' '
  })
  const excluded: string[] = []
  const groups: string[][] = [[]]
  for (const token of rest.split(/\s+/).filter(Boolean)) {
    if (token.startsWith('-') && token.length > 1) {
      excluded.push(...words(token).map(stem))
    } else if (token.toLowerCase() === 'or') {
      groups.push([])
    } else {
      const last = groups[groups.length - 1] ?? []
      last.push(
        ...words(token)
          .filter((w) => !STOPWORDS.has(w))
          .map(stem),
      )
    }
  }
  const usable = groups.filter((g) => g.length > 0)
  const highlight = new Set<string>([
    ...usable.flat(),
    ...phrases.flatMap((p) => words(p).map(stem)),
  ])
  return { groups: usable, phrases, excluded, highlight }
}

function keywordScore(text: string, query: ParsedQuery): number | null {
  const stems = words(text).map(stem)
  const present = new Set(stems)
  if (query.excluded.some((s) => present.has(s))) return null
  const lower = text.toLowerCase()
  if (query.phrases.some((p) => !lower.includes(p))) return null
  if (query.groups.length === 0 && query.phrases.length === 0) return null
  const matching = query.groups.filter((g) => g.every((s) => present.has(s)))
  if (query.groups.length > 0 && matching.length === 0) return null
  const wanted = new Set([...matching.flat(), ...query.phrases.flatMap((p) => words(p).map(stem))])
  let hits = 0
  for (const s of stems) if (wanted.has(s)) hits += 1
  return hits / Math.sqrt(Math.max(stems.length, 1))
}

function vector(text: string): Map<string, number> {
  const v = new Map<string, number>()
  for (const w of words(text)) {
    if (STOPWORDS.has(w)) continue
    const s = stem(w)
    const key = conceptOf.get(s) ?? s
    v.set(key, (v.get(key) ?? 0) + 1)
  }
  return v
}

function cosine(a: Map<string, number>, b: Map<string, number>): number {
  let dot = 0
  for (const [key, weight] of a) dot += weight * (b.get(key) ?? 0)
  const norm = (m: Map<string, number>) => Math.sqrt([...m.values()].reduce((s, x) => s + x * x, 0))
  const denominator = norm(a) * norm(b)
  return denominator === 0 ? 0 : dot / denominator
}

export function rank(passages: readonly Passage[], q: string, mode: Mode): Candidate[] {
  const query = parseQuery(q)
  const queryVector = vector(q)

  const fts = passages
    .map((passage) => ({ passage, score: keywordScore(passage.text, query) }))
    .filter((e): e is { passage: Passage; score: number } => e.score !== null)
    .sort((x, y) => y.score - x.score)
  const semantic = passages
    .map((passage) => ({ passage, similarity: cosine(queryVector, vector(passage.text)) }))
    .filter((e) => e.similarity >= MIN_SIMILARITY)
    .sort((x, y) => y.similarity - x.similarity)

  const byPassage = new Map<Passage, Candidate>()
  const entry = (passage: Passage): Candidate => {
    let candidate = byPassage.get(passage)
    if (!candidate) {
      candidate = {
        passage,
        ftsRank: null,
        semanticRank: null,
        ftsScore: null,
        semanticSimilarity: null,
        score: 0,
        stems: query.highlight,
      }
      byPassage.set(passage, candidate)
    }
    return candidate
  }
  if (mode !== 'semantic')
    fts.forEach((e, i) => {
      const c = entry(e.passage)
      c.ftsRank = i + 1
      c.ftsScore = e.score
    })
  if (mode !== 'keyword')
    semantic.forEach((e, i) => {
      const c = entry(e.passage)
      c.semanticRank = i + 1
      c.semanticSimilarity = e.similarity
    })
  for (const c of byPassage.values()) {
    c.score =
      (c.ftsRank === null ? 0 : 1 / (RRF_K + c.ftsRank)) +
      (c.semanticRank === null ? 0 : 1 / (RRF_K + c.semanticRank))
  }
  return [...byPassage.values()].sort((x, y) => y.score - x.score)
}

const escapeHtml = (text: string): string =>
  text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

/** Escape first, then wrap matches in <mark>, exactly like the backend's snippet contract. */
export function snippetFor(text: string, highlight: ReadonlySet<string>): string {
  const first = [...text.matchAll(/[\p{L}\p{N}]+/gu)].find((m) => highlight.has(stem(m[0])))
  const start = Math.max(0, (first?.index ?? 0) - 60)
  const slice = text.slice(start, start + 220)
  const body = (slice.match(/[\p{L}\p{N}]+|[^\p{L}\p{N}]+/gu) ?? [])
    .map((token) => {
      const escaped = escapeHtml(token)
      return /^[\p{L}\p{N}]/u.test(token) && highlight.has(stem(token))
        ? `<mark>${escaped}</mark>`
        : escaped
    })
    .join('')
  return `${start > 0 ? '… ' : ''}${body.trim()}${start + 220 < text.length ? ' …' : ''}`
}

/** Sentences of a passage: after . ! ? followed by whitespace, and at every line break. */
export function sentencesOf(text: string): string[] {
  return text
    .split(/(?<=[.!?])\s+|\n+/)
    .map((s) => s.trim())
    .filter((s) => /[\p{L}\p{N}]/u.test(s))
}

export interface AnswerSentence {
  text: string
  passage: Passage
}

const ANSWER_MIN_SCORE = 0.3

/**
 * Extractive answer like the service's AnswerExtractor: the best sentence of the top three passages by
 * similarity to the question (concept-aware here) plus a word-overlap bonus, minus a little per rank; a second
 * sentence joins when it scores almost as well. Null when nothing clears the bar.
 */
export function answerFor(
  q: string,
  top: readonly Passage[],
): { sentences: AnswerSentence[]; score: number } | null {
  const queryVector = vector(q)
  const queryStems = new Set(
    words(q)
      .filter((w) => !STOPWORDS.has(w))
      .map(stem),
  )
  const scored = top.slice(0, 3).flatMap((passage, rankIndex) =>
    sentencesOf(passage.text).map((text) => {
      const stems = new Set(words(text).map(stem))
      const overlap =
        queryStems.size === 0
          ? 0
          : [...queryStems].filter((s) => stems.has(s)).length / queryStems.size
      const score =
        0.5 * cosine(queryVector, vector(text)) +
        0.5 * cosine(queryVector, vector(passage.text)) +
        0.15 * overlap -
        0.05 * rankIndex
      return { sentence: { text, passage }, score }
    }),
  )
  scored.sort((a, b) => b.score - a.score)
  const best = scored[0]
  if (!best || best.score < ANSWER_MIN_SCORE) return null
  const second = scored[1]
  const sentences = [best.sentence]
  if (second && second.score >= ANSWER_MIN_SCORE && best.score - second.score <= 0.05)
    sentences.push(second.sentence)
  return { sentences, score: Math.round(best.score * 1000) / 1000 }
}
