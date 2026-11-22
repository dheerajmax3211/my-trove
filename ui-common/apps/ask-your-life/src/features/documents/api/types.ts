/** Typed mirror of the ask-your-life backend DTOs (DocumentDtos.java, SourceType, DocumentStatus). */

export const SOURCE_TYPES = ['NOTE', 'FILE', 'EMAIL', 'RECEIPT'] as const
export type SourceType = (typeof SOURCE_TYPES)[number]

/** PENDING: waiting for (re)indexing. INDEXED: searchable. FAILED: indexing gave up. */
export type DocumentStatus = 'PENDING' | 'INDEXED' | 'FAILED'

export interface DocumentResponse {
  id: string
  sourceType: SourceType
  externalId: string | null
  title: string
  mimeType: string
  contentHash: string
  status: DocumentStatus
  chunkCount: number
  /** ISO-8601 instants. */
  createdAt: string
  updatedAt: string
  ingestedAt: string | null
  /** Why indexing has not succeeded: the last error of the unfinished job. Absent when there is none. */
  indexingError?: string | null
}

export type IngestOutcome = 'CREATED' | 'UPDATED' | 'DUPLICATE'

export interface IngestResponse {
  outcome: IngestOutcome
  document: DocumentResponse
}

/** Body of `POST /v1/documents` with `Content-Type: application/json`. */
export interface CreateDocumentRequest {
  title?: string
  text: string
  sourceType?: SourceType
  mimeType?: string
  externalId?: string
}

/** Body of `PUT /v1/documents/{id}`. */
export interface UpdateDocumentRequest {
  title?: string
  text: string
  mimeType?: string
}
