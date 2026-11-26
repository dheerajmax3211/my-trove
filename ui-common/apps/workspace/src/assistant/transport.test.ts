import { createApiClient } from '@platform/api-client'
import { describe, expect, it, vi } from 'vitest'
import { MCP_PROTOCOL_VERSION, createMcpTransport, kindOfToolError } from './transport'

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })

function transportWith(answer: () => Response | Promise<Response>) {
  const fetchMock = vi.fn<typeof fetch>(() => Promise.resolve(answer()))
  const client = createApiClient({
    baseUrl: 'http://gw.test/api',
    getToken: () => 'person-token',
    fetch: fetchMock,
  })
  return { call: createMcpTransport(client), fetchMock }
}

const ok = (structuredContent: unknown) =>
  json({
    jsonrpc: '2.0',
    id: 1,
    result: { content: [{ type: 'text', text: 'x' }], isError: false, structuredContent },
  })

const toolError = (code: string) =>
  json({
    jsonrpc: '2.0',
    id: 1,
    result: {
      content: [{ type: 'text', text: 'nope' }],
      isError: true,
      structuredContent: { error: { code, message: 'nope' } },
    },
  })

describe('the live MCP transport', () => {
  it("sends one JSON-RPC tools/call to the gateway's MCP route with the person's own token", async () => {
    const { call, fetchMock } = transportWith(() => ok({ items: [], count: 0 }))
    const result = await call('waiting_on_list_followups', { limit: 5 })
    expect(result).toEqual({ ok: true, data: { items: [], count: 0 } })

    expect(fetchMock).toHaveBeenCalledTimes(1)
    const [url, init] = fetchMock.mock.calls[0] ?? []
    expect(url).toBe('http://gw.test/api/mcp/mcp')
    expect(init?.method).toBe('POST')
    const headers = new Headers(init?.headers)
    expect(headers.get('authorization')).toBe('Bearer person-token')
    expect(headers.get('accept')).toBe('application/json, text/event-stream')
    expect(headers.get('content-type')).toBe('application/json')
    expect(headers.get('mcp-protocol-version')).toBe(MCP_PROTOCOL_VERSION)
    const body = JSON.parse(init?.body as string) as Record<string, unknown>
    expect(body).toMatchObject({
      jsonrpc: '2.0',
      method: 'tools/call',
      params: { name: 'waiting_on_list_followups', arguments: { limit: 5 } },
    })
    expect(typeof body.id).toBe('number')
  })

  it('reads an answer sent as an event stream', async () => {
    const { call } = transportWith(
      () =>
        new Response(
          `event: message\ndata: ${JSON.stringify({ jsonrpc: '2.0', id: 1, result: { isError: false, structuredContent: { passages: [] } } })}\n\n`,
          { headers: { 'content-type': 'text/event-stream' } },
        ),
    )
    expect(await call('ask_your_life_search', { query: 'x' })).toEqual({
      ok: true,
      data: { passages: [] },
    })
  })

  it.each([
    ['forbidden', 'permission', "You don't have permission to read Home Pulse"],
    ['downstream_denied', 'permission', "You don't have permission to read Home Pulse"],
    ['delegation_refused', 'permission', "You don't have permission to read Home Pulse"],
    ['not_found', 'not_found', "Home Pulse couldn't find that."],
    ['invalid_input', 'invalid', "Home Pulse couldn't take that question"],
    ['unavailable', 'unavailable', "Home Pulse isn't answering right now"],
    ['internal', 'unavailable', "Home Pulse isn't answering right now"],
  ])('a tool error %s reads as a sentence (%s)', async (code, kind, sentence) => {
    const { call } = transportWith(() => toolError(code))
    const result = await call('home_pulse_appliance_status', {})
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.error.kind).toBe(kind)
    expect(result.error.message).toContain(sentence)
  })

  it('maps HTTP refusals and outages to sentences, never throwing', async () => {
    const cases: [() => Response, string, RegExp][] = [
      [
        () => json({ status: 403, title: 'Forbidden' }, 403),
        'permission',
        /isn't allowed to use the assistant/,
      ],
      [() => json({ status: 401, title: 'Unauthorized' }, 401), 'signed_out', /Sign in again/],
      [() => json({ status: 429, title: 'Too Many' }, 429), 'unavailable', /Too many questions/],
      [() => json({ status: 503, title: 'Down' }, 503), 'unavailable', /can't reach My-Trove/],
    ]
    for (const [answer, kind, sentence] of cases) {
      const { call } = transportWith(answer)
      const result = await call('family_treasury_ledger_summary', {})
      expect(result.ok).toBe(false)
      if (result.ok) continue
      expect(result.error.kind).toBe(kind)
      expect(result.error.message).toMatch(sentence)
    }
  })

  it('treats a network failure as the service being down', async () => {
    const { call } = transportWith(() => Promise.reject(new TypeError('Failed to fetch')))
    const result = await call('waiting_on_list_followups', {})
    expect(result).toMatchObject({ ok: false, error: { kind: 'unavailable' } })
  })

  it('treats a JSON-RPC error and an unreadable body as failures', async () => {
    let next = json({ jsonrpc: '2.0', id: 1, error: { code: -32602, message: 'bad' } })
    const { call } = transportWith(() => next)
    expect(await call('ask_your_life_search', { query: 'x' })).toMatchObject({
      ok: false,
      error: { kind: 'invalid' },
    })
    next = json({ jsonrpc: '2.0', id: 1, error: { code: -32603, message: 'boom' } })
    expect(await call('ask_your_life_search', { query: 'x' })).toMatchObject({
      ok: false,
      error: { kind: 'unavailable' },
    })
    next = new Response('<html>proxy error</html>', { headers: { 'content-type': 'text/html' } })
    expect(await call('ask_your_life_search', { query: 'x' })).toMatchObject({
      ok: false,
      error: { kind: 'unreadable' },
    })
    next = json({ jsonrpc: '2.0', id: 1, result: { isError: false } })
    expect(await call('ask_your_life_search', { query: 'x' })).toMatchObject({
      ok: false,
      error: { kind: 'unreadable' },
    })
  })

  it('knows every mcp-server error code', () => {
    expect(kindOfToolError('api_key_not_supported')).toBe('unavailable')
    expect(kindOfToolError('downstream_rejected')).toBe('invalid')
    expect(kindOfToolError(undefined)).toBe('unavailable')
  })
})
