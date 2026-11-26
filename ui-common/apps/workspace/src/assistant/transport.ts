/*
 * The live transport: one MCP `tools/call` per question, JSON-RPC 2.0 over Streamable HTTP, sent to the gateway's
 * `/mcp/mcp` route with the signed-in person's own token (the workspace's API client attaches it; the gateway
 * exchanges it and checks `mcp:use`). mcp-server is stateless, so no `initialize` handshake or session is needed
 * for a call; the protocol version is named in the header the spec asks for. mcp-server audits every call.
 */
import { isApiError, type ApiClient } from '@platform/api-client'
import type { ToolName } from './intent'
import { errorFor, type AssistantTransport, type ErrorKind, type ToolResult } from './tools'

export const MCP_PATH = '/mcp/mcp'
export const MCP_PROTOCOL_VERSION = '2025-06-18'

type Json = Record<string, unknown>
const obj = (value: unknown): Json | null =>
  typeof value === 'object' && value !== null && !Array.isArray(value) ? (value as Json) : null

/** A Streamable HTTP server may answer with an event stream; the JSON-RPC message is the last `data:` line. */
function messageOf(body: unknown): Json | null {
  if (typeof body !== 'string') return obj(body)
  const data = body
    .split(/\r?\n/)
    .filter((line) => line.startsWith('data:'))
    .map((line) => line.slice(5).trim())
    .pop()
  try {
    return obj(JSON.parse(data ?? body))
  } catch {
    return null
  }
}

/** A tool error's `structuredContent.error.code` (see mcp-server's ToolErrors) as the kind of failure it is. */
export function kindOfToolError(code: unknown): ErrorKind {
  switch (code) {
    case 'forbidden':
    case 'downstream_denied':
    case 'delegation_refused':
      return 'permission'
    case 'not_found':
      return 'not_found'
    case 'invalid_input':
    case 'downstream_rejected':
      return 'invalid'
    default:
      return 'unavailable'
  }
}

/** What one JSON-RPC response means for the person. */
export function resultFromMessage(tool: ToolName, body: unknown): ToolResult {
  const message = messageOf(body)
  if (!message) return { ok: false, error: errorFor('unreadable', tool) }
  const rpcError = obj(message.error)
  if (rpcError) {
    // -32602: arguments the schema refused; -32601: no such method. Anything else is the server failing.
    const code = rpcError.code
    return {
      ok: false,
      error: errorFor(code === -32602 || code === -32601 ? 'invalid' : 'unavailable', tool),
    }
  }
  const result = obj(message.result)
  if (!result) return { ok: false, error: errorFor('unreadable', tool) }
  const structured = obj(result.structuredContent)
  if (result.isError === true) {
    return { ok: false, error: errorFor(kindOfToolError(obj(structured?.error)?.code), tool) }
  }
  if (!structured) return { ok: false, error: errorFor('unreadable', tool) }
  return { ok: true, data: structured }
}

/** An HTTP failure (the gateway or mcp-server refusing the request itself) as a sentence. */
export function resultFromHttpError(tool: ToolName, error: unknown): ToolResult {
  const status = isApiError(error) ? error.status : 0
  if (status === 401) return { ok: false, error: errorFor('signed_out', tool) }
  if (status === 403) {
    return {
      ok: false,
      error: {
        kind: 'permission',
        message: "Your account isn't allowed to use the assistant. Ask an admin if you need it.",
      },
    }
  }
  if (status === 429) {
    return {
      ok: false,
      error: {
        kind: 'unavailable',
        message: 'Too many questions at once. Wait a moment and ask again.',
      },
    }
  }
  return {
    ok: false,
    error: {
      kind: 'unavailable',
      message: "The assistant can't reach My-Trove right now. Try again in a minute.",
    },
  }
}

/** Calls the MCP server through the gateway with the workspace's own API client (bound to the gateway root). */
export function createMcpTransport(client: ApiClient): AssistantTransport {
  let id = 0
  return async (tool, args) => {
    id += 1
    try {
      const body = await client.post<unknown>(
        MCP_PATH,
        { jsonrpc: '2.0', id, method: 'tools/call', params: { name: tool, arguments: args } },
        {
          headers: {
            Accept: 'application/json, text/event-stream',
            'MCP-Protocol-Version': MCP_PROTOCOL_VERSION,
          },
        },
      )
      return resultFromMessage(tool, body)
    } catch (error) {
      return resultFromHttpError(tool, error)
    }
  }
}
