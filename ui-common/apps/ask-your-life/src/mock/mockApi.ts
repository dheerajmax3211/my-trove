/**
 * In-memory stand-in for the ask-your-life service (port 8086). It mimics the real contract:
 * same paths, status codes and RFC 9457 problem bodies, ingestion outcomes (CREATED / UPDATED /
 * DUPLICATE), the PENDING -> INDEXED lifecycle, and search with `<mark>` snippets and debug data.
 *
 * Demo trigger: a document whose text contains FAIL-INDEXING ends up FAILED instead of INDEXED.
 */
import type {
  DocumentResponse,
  DocumentStatus,
  IngestOutcome,
  SourceType,
} from '../features/documents/api/types'
import { SOURCE_TYPES } from '../features/documents/api/types'
import type { SearchHit, SearchResponse } from '../features/search/api/types'
import { SEED_DOCUMENTS, type SeedDocument } from './seed'
import { rank, snippetFor, type Mode, type Passage } from './searchEngine'
import { baseType, chunkText, extractText, fingerprint, isSupportedType, titleFor } from './text'

export interface MockApiOptions {
  /** Simulated network latency per request. Default 200ms; use 0 in tests. */
  latencyMs?: number
  /** Initial library. `false` starts empty (first-use state). Default: the demo seed. */
  seed?: readonly SeedDocument[] | false
  /** How many times a PENDING document is looked at before it finishes indexing. Default 2. */
  indexAfterPolls?: number
  /** Largest accepted document. Default 2 MiB, like the service. */
  maxBytes?: number
}

export interface MockApi {
  fetch: typeof fetch
  /** Every request seen, as `METHOD path?query`, oldest first. */
  requests: string[]
}

interface Stored {
  doc: DocumentResponse
  text: string
  /** What search can currently see (the old passages stay until a re-index finishes). */
  passages: string[]
  polls: number
}

const TITLE_MAX = 500
const EXTERNAL_ID_MAX = 256
const FAIL_MARKER = 'FAIL-INDEXING'

function respond(status: number, body: unknown, headers: Record<string, string> = {}): Response {
  return new Response(body === undefined ? null : JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json', ...headers },
  })
}

const REASONS: Readonly<Record<number, string>> = {
  400: 'Bad Request',
  401: 'Unauthorized',
  404: 'Not Found',
  409: 'Conflict',
  413: 'Content Too Large',
  415: 'Unsupported Media Type',
}

function problem(status: number, detail: string, path: string): Response {
  return new Response(
    JSON.stringify({
      type: 'about:blank',
      title: REASONS[status] ?? `HTTP ${status}`,
      status,
      detail,
      instance: path,
    }),
    { status, headers: { 'content-type': 'application/problem+json' } },
  )
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

const optionalString = (value: unknown): string | undefined =>
  typeof value === 'string' ? value : undefined

const isSourceType = (value: unknown): value is SourceType =>
  typeof value === 'string' && (SOURCE_TYPES as readonly string[]).includes(value)

async function readText(file: Blob): Promise<string> {
  if (typeof file.text === 'function') return file.text()
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(typeof reader.result === 'string' ? reader.result : '')
    reader.onerror = () => reject(new Error('Could not read the file'))
    reader.readAsText(file)
  })
}

function mimeFromFile(file: File): string | null {
  if (file.type !== '' && file.type !== 'application/octet-stream') return file.type
  const name = file.name.toLowerCase()
  if (/\.(md|markdown)$/.test(name)) return 'text/markdown'
  if (/\.html?$/.test(name)) return 'text/html'
  if (name.endsWith('.pdf')) return 'application/pdf'
  if (/\.(txt|csv|log|eml)$/.test(name)) return 'text/plain'
  return null
}

function stripExtension(name: string): string | undefined {
  if (name === '') return undefined
  const dot = name.lastIndexOf('.')
  return dot > 0 ? name.slice(0, dot) : name
}

/**
 * The service path of a request. The standalone app calls `/api/v1/...`; inside the workspace the
 * client is bound to the gateway route, `<gateway>/api/ask-your-life/v1/...`. Both reach the same handlers.
 */
function apiPath(url: URL): string {
  return url.pathname.replace(/^\/api(\/ask-your-life)?(?=\/|$)/, '')
}

export function createMockApi(options: MockApiOptions = {}): MockApi {
  const latencyMs = options.latencyMs ?? 200
  const indexAfterPolls = options.indexAfterPolls ?? 2
  const maxBytes = options.maxBytes ?? 2 * 1024 * 1024
  const requests: string[] = []
  const store = new Map<string, Stored>()
  let sequence = 0

  const nextId = (): string => {
    sequence += 1
    return `00000000-0000-7000-8000-${String(sequence).padStart(12, '0')}`
  }

  const create = (
    input: {
      title: string
      sourceType: SourceType
      mimeType: string
      text: string
      externalId: string | null
    },
    createdAt: Date,
    status: DocumentStatus,
  ): Stored => {
    const doc: DocumentResponse = {
      id: nextId(),
      sourceType: input.sourceType,
      externalId: input.externalId,
      title: input.title,
      mimeType: input.mimeType,
      contentHash: fingerprint(input.text),
      status,
      chunkCount: 0,
      createdAt: createdAt.toISOString(),
      updatedAt: createdAt.toISOString(),
      ingestedAt: null,
    }
    const stored: Stored = { doc, text: input.text, passages: [], polls: 0 }
    if (status === 'INDEXED') finishIndexing(stored)
    store.set(doc.id, stored)
    return stored
  }

  const finishIndexing = (stored: Stored): void => {
    const now = new Date().toISOString()
    if (stored.text.includes(FAIL_MARKER)) {
      stored.doc = { ...stored.doc, status: 'FAILED' }
      return
    }
    stored.passages = chunkText(stored.text)
    stored.doc = {
      ...stored.doc,
      status: 'INDEXED',
      chunkCount: stored.passages.length,
      ingestedAt: now,
    }
  }

  /** Looking at a PENDING document moves its indexing along, so the UI's polling is what finishes it. */
  const observe = (stored: Stored): DocumentResponse => {
    if (stored.doc.status === 'PENDING') {
      stored.polls += 1
      if (stored.polls >= indexAfterPolls) finishIndexing(stored)
    }
    return stored.doc
  }

  if (options.seed !== false) {
    for (const seed of options.seed ?? SEED_DOCUMENTS) {
      create(
        {
          title: seed.title,
          sourceType: seed.sourceType,
          mimeType: seed.mimeType,
          text: extractText(seed.mimeType, seed.text),
          externalId: seed.externalId ?? null,
        },
        new Date(seed.createdAt),
        'INDEXED',
      )
    }
  }

  const findByHash = (hash: string): Stored | undefined =>
    [...store.values()].find((s) => s.doc.contentHash === hash)
  const findByExternalId = (externalId: string): Stored | undefined =>
    [...store.values()].find((s) => s.doc.externalId === externalId)

  interface Incoming {
    title: string | undefined
    sourceType: SourceType
    mimeType: string
    text: string
    externalId: string | undefined
  }

  /** Mirrors DocumentService.ingest. */
  const ingest = (
    incoming: Incoming,
    path: string,
  ): { outcome: IngestOutcome; stored: Stored } | Response => {
    if (new TextEncoder().encode(incoming.text).length > maxBytes)
      return problem(413, `Document exceeds ${maxBytes} bytes`, path)
    if (incoming.text.trim() === '') return problem(400, 'Document body is empty', path)
    if (!isSupportedType(incoming.mimeType))
      return problem(
        415,
        `No text extractor is registered for ${baseType(incoming.mimeType)}${
          baseType(incoming.mimeType) === 'application/pdf'
            ? ' (PDF extraction is an extension point: register a TextExtractor bean)'
            : ''
        }`,
        path,
      )
    const text = extractText(incoming.mimeType, incoming.text)
    if (text === '') return problem(400, 'Document contains no extractable text', path)
    const hash = fingerprint(text)
    const title = titleFor(incoming.title, text)
    const externalId = incoming.externalId?.trim() ? incoming.externalId.trim() : null
    const sameContent = findByHash(hash)

    if (externalId) {
      const existing = findByExternalId(externalId)
      if (existing) {
        if (existing.doc.contentHash === hash) return { outcome: 'DUPLICATE', stored: existing }
        if (sameContent)
          return problem(409, 'Another document of yours already has exactly this content', path)
        return {
          outcome: 'UPDATED',
          stored: replace(existing, title, incoming.mimeType, text, hash),
        }
      }
    }
    if (sameContent) return { outcome: 'DUPLICATE', stored: sameContent }
    return {
      outcome: 'CREATED',
      stored: create(
        {
          title,
          sourceType: incoming.sourceType,
          mimeType: baseType(incoming.mimeType),
          text,
          externalId,
        },
        new Date(),
        'PENDING',
      ),
    }
  }

  const replace = (
    stored: Stored,
    title: string,
    mimeType: string,
    text: string,
    hash: string,
  ): Stored => {
    stored.text = text
    stored.polls = 0
    stored.doc = {
      ...stored.doc,
      title,
      mimeType: baseType(mimeType),
      contentHash: hash,
      status: 'PENDING',
      updatedAt: new Date().toISOString(),
    }
    return stored
  }

  const ingestResponse = (result: ReturnType<typeof ingest>): Response => {
    if (result instanceof Response) return result
    const body = { outcome: result.outcome, document: result.stored.doc }
    return result.outcome === 'DUPLICATE'
      ? respond(200, body)
      : respond(202, body, { location: `/v1/documents/${result.stored.doc.id}` })
  }

  const handleSearch = (params: URLSearchParams, path: string, forceDebug: boolean): Response => {
    const q = (params.get('q') ?? '').trim()
    if (q === '') return problem(400, 'q must not be blank', path)
    if (q.length > 500) return problem(400, 'q must be at most 500 characters', path)
    const k = params.has('k') ? Number(params.get('k')) : 10
    if (!Number.isInteger(k) || k < 1 || k > 50)
      return problem(400, 'k must be between 1 and 50', path)
    const modeParam = (params.get('mode') ?? 'hybrid').toLowerCase()
    if (modeParam !== 'hybrid' && modeParam !== 'keyword' && modeParam !== 'semantic')
      return problem(400, 'mode must be one of hybrid, keyword, semantic', path)
    const mode: Mode = modeParam
    const types = params.getAll('sourceType')
    if (types.some((t) => !isSourceType(t))) return problem(400, 'Invalid sourceType', path)
    const parse = (name: string): Date | null | 'bad' => {
      const raw = params.get(name)
      if (raw === null) return null
      const d = new Date(raw)
      return Number.isNaN(d.getTime()) ? 'bad' : d
    }
    const from = parse('from')
    const to = parse('to')
    if (from === 'bad' || to === 'bad')
      return problem(400, 'from/to must be ISO-8601 instants', path)
    if (from && to && from >= to) return problem(400, "'from' must be before 'to'", path)
    const debug = forceDebug || params.get('debug') === 'true'

    const passages: Passage[] = []
    for (const stored of store.values()) {
      const created = new Date(stored.doc.createdAt)
      if (types.length > 0 && !types.includes(stored.doc.sourceType)) continue
      if (from && created < from) continue
      if (to && created >= to) continue
      stored.passages.forEach((text, ordinal) =>
        passages.push({ documentId: stored.doc.id, ordinal, text }),
      )
    }

    const seen = new Set<string>()
    const hits: SearchHit[] = []
    for (const candidate of rank(passages, q, mode)) {
      const id = candidate.passage.documentId
      if (seen.has(id)) continue
      seen.add(id)
      const doc = store.get(id)?.doc
      if (!doc) continue
      hits.push({
        documentId: id,
        chunkId: `${id}:${candidate.passage.ordinal}`,
        title: doc.title,
        sourceType: doc.sourceType,
        createdAt: doc.createdAt,
        chunkOrdinal: candidate.passage.ordinal,
        snippet: snippetFor(candidate.passage.text, candidate.stems),
        score: candidate.score,
        ...(debug
          ? {
              explain: {
                ftsRank: candidate.ftsRank,
                semanticRank: candidate.semanticRank,
                ftsScore: candidate.ftsScore,
                semanticSimilarity: candidate.semanticSimilarity,
              },
            }
          : {}),
      })
      if (hits.length === k) break
    }
    const body: SearchResponse = {
      query: q,
      mode: mode.toUpperCase(),
      k,
      hits,
      debug: debug
        ? {
            rrfK: 60,
            fusion: 'score = sum(1 / (rrfK + rank)) over the lists the chunk appears in',
            candidatePool: Math.max(100, k * 4),
          }
        : null,
    }
    return respond(200, body)
  }

  const handler = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const url = new URL(
      typeof input === 'string' ? input : input instanceof URL ? input.href : input.url,
      window.location.origin,
    )
    const method = (init?.method ?? 'GET').toUpperCase()
    const path = apiPath(url)
    requests.push(`${method} ${path}${url.search}`)
    const token = new Headers(init?.headers).get('authorization')?.replace(/^Bearer /, '')

    if (latencyMs > 0) await new Promise((r) => setTimeout(r, latencyMs))

    if (!token || token.endsWith('-expired'))
      return problem(401, token ? 'The ID token has expired.' : 'Missing bearer token.', path)

    if (method === 'GET' && path === '/v1/search')
      return handleSearch(url.searchParams, path, false)
    if (method === 'GET' && path === '/v1/search/explain')
      return handleSearch(url.searchParams, path, true)

    if (path === '/v1/documents') {
      if (method === 'GET') {
        const type = url.searchParams.get('sourceType')
        if (type !== null && !isSourceType(type)) return problem(400, 'Invalid sourceType', path)
        const limit = Number(url.searchParams.get('limit') ?? 50)
        const offset = Number(url.searchParams.get('offset') ?? 0)
        if (
          !Number.isInteger(limit) ||
          limit < 1 ||
          limit > 200 ||
          !Number.isInteger(offset) ||
          offset < 0
        )
          return problem(400, 'limit must be 1-200 and offset 0 or more', path)
        const page = [...store.values()]
          .filter((s) => type === null || s.doc.sourceType === type)
          .sort((a, b) => b.doc.createdAt.localeCompare(a.doc.createdAt))
          .slice(offset, offset + limit)
        return respond(
          200,
          page.map((s) => observe(s)),
        )
      }
      if (method === 'POST') return handleIngest(url, init)
    }

    const one = /^\/v1\/documents\/([^/]+)$/.exec(path)
    if (one) {
      const stored = store.get(decodeURIComponent(one[1] ?? ''))
      if (!stored) return problem(404, 'Document not found', path)
      if (method === 'GET') return respond(200, observe(stored))
      if (method === 'DELETE') {
        store.delete(stored.doc.id)
        return new Response(null, { status: 204 })
      }
      if (method === 'PUT') {
        const body = parseJson(init?.body)
        if (!isRecord(body) || typeof body.text !== 'string' || body.text.trim() === '')
          return problem(400, 'Invalid request content.', path)
        const title = optionalString(body.title)
        if (title !== undefined && title.length > TITLE_MAX)
          return problem(400, 'Invalid request content.', path)
        const mimeType = optionalString(body.mimeType) ?? stored.doc.mimeType
        if (!isSupportedType(mimeType))
          return problem(415, `No text extractor is registered for ${baseType(mimeType)}`, path)
        const text = extractText(mimeType, body.text)
        if (text === '') return problem(400, 'Document contains no extractable text', path)
        const hash = fingerprint(text)
        if (stored.doc.contentHash === hash)
          return respond(200, { outcome: 'DUPLICATE', document: stored.doc })
        if (findByHash(hash))
          return problem(409, 'Another document of yours already has exactly this content', path)
        const newTitle = title && title.trim() !== '' ? titleFor(title, text) : stored.doc.title
        return ingestResponse({
          outcome: 'UPDATED',
          stored: replace(stored, newTitle, mimeType, text, hash),
        })
      }
    }

    return problem(404, `${method} ${path} does not exist.`, path)
  }

  const parseJson = (body: unknown): unknown => {
    if (typeof body !== 'string') return undefined
    try {
      return JSON.parse(body) as unknown
    } catch {
      return undefined
    }
  }

  const handleIngest = async (url: URL, init?: RequestInit): Promise<Response> => {
    const path = apiPath(url)
    const body = init?.body
    if (body instanceof FormData) {
      const file = body.get('file')
      if (!(file instanceof File)) return problem(400, "Required part 'file' is not present.", path)
      const mime = mimeFromFile(file)
      if (mime === null)
        return problem(
          415,
          'Cannot tell the file type; send a text/* content type or a .txt/.md/.html file name',
          path,
        )
      const type = body.get('sourceType')
      const title = optionalString(body.get('title') ?? undefined)
      return ingestResponse(
        ingest(
          {
            title: title && title.trim() !== '' ? title : stripExtension(file.name),
            sourceType: isSourceType(type) ? type : 'FILE',
            mimeType: mime,
            text: await readText(file),
            externalId: optionalString(body.get('externalId') ?? undefined),
          },
          path,
        ),
      )
    }
    const json = parseJson(body)
    if (!isRecord(json)) return problem(400, 'Failed to read request', path)
    const title = optionalString(json.title)
    const externalId = optionalString(json.externalId)
    const mimeType = optionalString(json.mimeType) ?? 'text/plain'
    if (
      typeof json.text !== 'string' ||
      json.text.trim() === '' ||
      (title !== undefined && title.length > TITLE_MAX) ||
      (externalId !== undefined && externalId.length > EXTERNAL_ID_MAX) ||
      (json.sourceType !== undefined && json.sourceType !== null && !isSourceType(json.sourceType))
    )
      return problem(400, 'Invalid request content.', path)
    return ingestResponse(
      ingest(
        {
          title,
          sourceType: isSourceType(json.sourceType) ? json.sourceType : 'NOTE',
          mimeType,
          text: json.text,
          externalId,
        },
        path,
      ),
    )
  }

  return { fetch: handler, requests }
}
