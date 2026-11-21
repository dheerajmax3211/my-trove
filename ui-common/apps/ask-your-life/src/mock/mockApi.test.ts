import { describe, expect, it } from 'vitest'
import { createMockApi } from './mockApi'

interface Body {
  outcome: string
  status: string
  chunkCount: number
  document: { id: string; status: string }
  hits: { snippet: string; explain?: unknown }[]
}

const TOKEN = { Authorization: 'Bearer t' }

function client(options: Parameters<typeof createMockApi>[0] = {}) {
  const api = createMockApi({ latencyMs: 0, ...options })
  const call = async (path: string, init: RequestInit = {}) => {
    const response = await api.fetch(`/api${path}`, { headers: TOKEN, ...init })
    const text = await response.text()
    return {
      status: response.status,
      type: response.headers.get('content-type'),
      body: text ? (JSON.parse(text) as Body) : null,
    }
  }
  const post = (body: unknown) =>
    call('/v1/documents', {
      method: 'POST',
      body: JSON.stringify(body),
      headers: { ...TOKEN, 'Content-Type': 'application/json' },
    })
  return { api, call, post }
}

describe('mock API honours the backend contract', () => {
  it('rejects missing and expired tokens with problem+json 401', async () => {
    const { api } = client()
    const missing = await api.fetch('/api/v1/documents')
    expect(missing.status).toBe(401)
    expect(missing.headers.get('content-type')).toBe('application/problem+json')
    expect(
      (await api.fetch('/api/v1/documents', { headers: { Authorization: 'Bearer x-expired' } }))
        .status,
    ).toBe(401)
  })

  it('create -> 202 CREATED/PENDING, identical text -> 200 DUPLICATE, same externalId + new text -> UPDATED', async () => {
    const { post } = client({ seed: false })
    const created = await post({ title: 'A', text: 'hello world', externalId: 'e1' })
    expect(created.status).toBe(202)
    expect(created.body?.outcome).toBe('CREATED')
    expect(created.body?.document.status).toBe('PENDING')
    const again = await post({ text: 'hello world' })
    expect(again.status).toBe(200)
    expect(again.body?.outcome).toBe('DUPLICATE')
    const updated = await post({ text: 'hello again', externalId: 'e1' })
    expect(updated.status).toBe(202)
    expect(updated.body?.outcome).toBe('UPDATED')
    expect(updated.body?.document.id).toBe(created.body?.document.id)
    await post({ text: 'something else' })
    const clash = await post({ text: 'something else', externalId: 'e1' })
    expect(clash.status).toBe(409)
  })

  it('validates like Spring does: 400 for blank text, 413 for large, 415 for PDF multipart', async () => {
    const { post, call, api } = client({ seed: false, maxBytes: 10 })
    expect((await post({ text: '   ' })).status).toBe(400)
    const large = await post({ text: 'x'.repeat(11) })
    expect(large.status).toBe(413)
    expect(large.type).toBe('application/problem+json')
    const form = new FormData()
    form.append('file', new File(['%PDF'], 'a.pdf', { type: 'application/pdf' }))
    const pdf = await api.fetch('/api/v1/documents', { method: 'POST', body: form, headers: TOKEN })
    expect(pdf.status).toBe(415)
    expect(((await pdf.json()) as { detail: string }).detail).toMatch(
      /PDF extraction is an extension point/,
    )
    expect((await call('/v1/documents/nope')).status).toBe(404)
  })

  it('moves PENDING to INDEXED as it is observed, and only then is it searchable', async () => {
    const { post, call } = client({ seed: false, indexAfterPolls: 2 })
    const created = await post({ text: 'The zebra crossing is on Main Street.' })
    const id = created.body?.document.id as string
    expect((await call('/v1/search?q=zebra')).body?.hits).toHaveLength(0)
    expect((await call(`/v1/documents/${id}`)).body?.status).toBe('PENDING')
    const second = await call(`/v1/documents/${id}`)
    expect(second.body?.status).toBe('INDEXED')
    expect(second.body?.chunkCount).toBe(1)
    expect((await call('/v1/search?q=zebra')).body?.hits).toHaveLength(1)
    expect((await call(`/v1/documents/${id}`, { method: 'DELETE' })).status).toBe(204)
    expect((await call('/v1/search?q=zebra')).body?.hits).toHaveLength(0)
  })

  it('search validates parameters and escapes snippets before adding <mark>', async () => {
    const { post, call } = client({ seed: false, indexAfterPolls: 1 })
    await post({
      title: 'Tags',
      text: 'Use <b>bold</b> & <script>alert(1)</script> for emphasis',
      mimeType: 'text/plain',
    })
    await call('/v1/documents')
    expect((await call('/v1/search?q=')).status).toBe(400)
    expect((await call('/v1/search?q=a&mode=nope')).status).toBe(400)
    expect((await call('/v1/search?q=a&k=51')).status).toBe(400)
    expect(
      (await call('/v1/search?q=a&from=2026-02-01T00:00:00Z&to=2026-01-01T00:00:00Z')).status,
    ).toBe(400)
    const hit = (await call('/v1/search?q=emphasis&debug=true')).body?.hits[0]
    expect(hit?.snippet).toContain('&lt;script&gt;')
    expect(hit?.snippet).not.toContain('<script>')
    expect(hit?.snippet).toContain('<mark>emphasis</mark>')
    expect(hit?.explain).toBeDefined()
    expect((await call('/v1/search?q=emphasis')).body?.hits[0]?.explain).toBeUndefined()
  })
})
