import { apiQueryKey, type ApiError, type QueryParams } from '@platform/api-client'
import type { CreateDocumentRequest, SourceType, UpdateDocumentRequest } from './types'

export const DOCUMENTS_PATH = '/v1/documents'

export const documentPath = (id: string): string => `${DOCUMENTS_PATH}/${encodeURIComponent(id)}`

export const documentsKey = apiQueryKey(DOCUMENTS_PATH)
export const documentKey = (id: string) => apiQueryKey(documentPath(id))

export const MAX_TITLE_LENGTH = 500
export const MAX_EXTERNAL_ID_LENGTH = 256
export const PAGE_SIZE = 25

export interface NoteInput {
  title: string
  text: string
  sourceType: SourceType
  externalId: string
}

const blankToUndefined = (value: string): string | undefined => {
  const trimmed = value.trim()
  return trimmed === '' ? undefined : trimmed
}

/** Pasted notes are sent as Markdown JSON; blank optional fields are left out so the server derives them. */
export function buildCreateBody(input: NoteInput): CreateDocumentRequest {
  const title = blankToUndefined(input.title)
  const externalId = blankToUndefined(input.externalId)
  return {
    ...(title ? { title } : {}),
    text: input.text,
    sourceType: input.sourceType,
    mimeType: 'text/markdown',
    ...(externalId ? { externalId } : {}),
  }
}

export interface UploadInput {
  file: File
  title: string
  sourceType: SourceType
  externalId: string
}

/** Multipart body: part `file`, plus optional `title`, `sourceType` and `externalId`. */
export function buildUploadForm(input: UploadInput): FormData {
  const form = new FormData()
  form.append('file', input.file, input.file.name)
  const title = blankToUndefined(input.title)
  const externalId = blankToUndefined(input.externalId)
  if (title) form.append('title', title)
  form.append('sourceType', input.sourceType)
  if (externalId) form.append('externalId', externalId)
  return form
}

export interface ReplaceInput {
  id: string
  title: string
  text: string
}

export function buildUpdateBody(input: ReplaceInput): UpdateDocumentRequest {
  const title = blankToUndefined(input.title)
  return { ...(title ? { title } : {}), text: input.text }
}

export function listQuery(
  sourceType: SourceType | null,
  offset: number,
  limit = PAGE_SIZE,
): QueryParams {
  return { ...(sourceType ? { sourceType } : {}), limit, offset }
}

export interface FieldErrors {
  title?: string
  text?: string
  externalId?: string
  file?: string
}

/** Client-side checks that mirror the server's validation, so the common mistakes never leave the page. */
export function validateNote(input: {
  title: string
  text: string
  externalId: string
}): FieldErrors {
  const errors: FieldErrors = {}
  if (input.text.trim() === '') errors.text = 'Write something to save.'
  if (input.title.trim().length > MAX_TITLE_LENGTH)
    errors.title = `Keep the title under ${MAX_TITLE_LENGTH} characters.`
  if (input.externalId.trim().length > MAX_EXTERNAL_ID_LENGTH)
    errors.externalId = `Keep the external ID under ${MAX_EXTERNAL_ID_LENGTH} characters.`
  return errors
}

export function validateUpload(input: {
  file: File | null
  title: string
  externalId: string
}): FieldErrors {
  const errors: FieldErrors = {}
  if (!input.file) errors.file = 'Choose a file to upload.'
  else if (input.file.size === 0) errors.file = 'That file is empty.'
  if (input.title.trim().length > MAX_TITLE_LENGTH)
    errors.title = `Keep the title under ${MAX_TITLE_LENGTH} characters.`
  if (input.externalId.trim().length > MAX_EXTERNAL_ID_LENGTH)
    errors.externalId = `Keep the external ID under ${MAX_EXTERNAL_ID_LENGTH} characters.`
  return errors
}

export interface FriendlyError {
  title: string
  message: string
}

/** Turns an ingestion failure into words a person can act on. */
export function describeIngestError(error: ApiError): FriendlyError {
  switch (error.status) {
    case 0:
      return {
        title: 'Could not reach the server',
        message: 'Check your connection and try again. Nothing was saved.',
      }
    case 400:
      return {
        title: 'That could not be added',
        message: error.detail ?? 'Check the text and try again.',
      }
    case 409:
      return {
        title: 'Same content already exists',
        message: 'Another document of yours already has exactly this content, so nothing changed.',
      }
    case 413:
      return {
        title: 'That is too large',
        message: `The document is over the size limit. Split it into smaller parts and add them separately.${
          error.detail ? ` (${error.detail})` : ''
        }`,
      }
    case 415:
      return {
        title: 'This file type is not supported yet',
        message:
          'Only text, Markdown and HTML files can be read today. PDFs and other binary files are not supported. Paste the text as a note, or save the file as .txt, .md or .html first.',
      }
    default:
      return {
        title: 'Something went wrong',
        message: error.detail ?? 'Please try again in a moment.',
      }
  }
}
