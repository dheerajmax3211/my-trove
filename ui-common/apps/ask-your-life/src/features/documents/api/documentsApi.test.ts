import { ApiError } from '@platform/api-client'
import { describe, expect, it } from 'vitest'
import {
  buildCreateBody,
  buildUpdateBody,
  buildUploadForm,
  describeIngestError,
  documentPath,
  listQuery,
  validateNote,
  validateUpload,
} from './documentsApi'

describe('request shapes', () => {
  it('sends a pasted note as markdown JSON and leaves blank optionals out', () => {
    expect(
      buildCreateBody({ title: '  ', text: '# Hi', sourceType: 'NOTE', externalId: '' }),
    ).toEqual({ text: '# Hi', sourceType: 'NOTE', mimeType: 'text/markdown' })
    expect(
      buildCreateBody({ title: ' Plan ', text: 'x', sourceType: 'RECEIPT', externalId: ' r-1 ' }),
    ).toEqual({
      title: 'Plan',
      text: 'x',
      sourceType: 'RECEIPT',
      mimeType: 'text/markdown',
      externalId: 'r-1',
    })
  })

  it('builds the multipart upload with part "file" and optional fields', () => {
    const file = new File(['hello'], 'notes.md', { type: 'text/markdown' })
    const form = buildUploadForm({ file, title: '', sourceType: 'FILE', externalId: 'ext-9' })
    expect((form.get('file') as File).name).toBe('notes.md')
    expect(form.get('sourceType')).toBe('FILE')
    expect(form.get('externalId')).toBe('ext-9')
    expect(form.has('title')).toBe(false)
  })

  it('builds the replace body and paths', () => {
    expect(buildUpdateBody({ id: '1', title: '', text: 'new' })).toEqual({ text: 'new' })
    expect(documentPath('a/b')).toBe('/v1/documents/a%2Fb')
    expect(listQuery(null, 0)).toEqual({ limit: 25, offset: 0 })
    expect(listQuery('FILE', 25)).toEqual({ sourceType: 'FILE', limit: 25, offset: 25 })
  })
})

describe('client validation', () => {
  it('requires text and caps lengths', () => {
    expect(validateNote({ title: '', text: '   ', externalId: '' }).text).toBeDefined()
    expect(validateNote({ title: 'x'.repeat(501), text: 'a', externalId: '' }).title).toBeDefined()
    expect(
      validateNote({ title: '', text: 'a', externalId: 'x'.repeat(257) }).externalId,
    ).toBeDefined()
    expect(validateNote({ title: 'ok', text: 'a', externalId: '' })).toEqual({})
  })

  it('requires a non-empty file', () => {
    expect(validateUpload({ file: null, title: '', externalId: '' }).file).toMatch(/Choose/)
    expect(validateUpload({ file: new File([], 'a.txt'), title: '', externalId: '' }).file).toMatch(
      /empty/,
    )
    expect(validateUpload({ file: new File(['x'], 'a.txt'), title: '', externalId: '' })).toEqual(
      {},
    )
  })
})

describe('error mapping', () => {
  const error = (status: number, detail?: string) =>
    new ApiError({ status, title: 'x', ...(detail ? { detail } : {}) })

  it('explains 415 in terms of PDFs and what to do instead', () => {
    const e = describeIngestError(error(415, 'No text extractor is registered for application/pdf'))
    expect(e.title).toBe('This file type is not supported yet')
    expect(e.message).toMatch(/PDF/)
    expect(e.message).toMatch(/paste the text/i)
  })

  it('maps the other statuses', () => {
    expect(describeIngestError(error(413, 'Document exceeds 10 bytes')).message).toContain(
      'Document exceeds 10 bytes',
    )
    expect(describeIngestError(error(409)).title).toBe('Same content already exists')
    expect(describeIngestError(error(400, 'Document body is empty')).message).toBe(
      'Document body is empty',
    )
    expect(describeIngestError(error(0)).title).toBe('Could not reach the server')
    expect(describeIngestError(error(500)).title).toBe('Something went wrong')
  })
})
