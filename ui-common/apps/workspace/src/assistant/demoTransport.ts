/*
 * Demo mode (`?demo=1`): the same four tools, answered in the browser from each product's own in-memory mock API
 * (the clients the workspace already gives those modules in demo mode), so the public demo can show the assistant
 * and never touches the network. Each function mirrors its mcp-server tool and returns the same `structuredContent`
 * shape, so the panel renders demo and live answers with the same code.
 */
import { isApiError, type ApiClient } from '@platform/api-client'
import { MAX_QUERY, TOOL_PRODUCT, type ToolName } from './intent'
import { errorFor, type AssistantTransport, type ToolArguments, type ToolResult } from './tools'

type Json = Record<string, unknown>
const obj = (value: unknown): Json =>
  typeof value === 'object' && value !== null && !Array.isArray(value) ? (value as Json) : {}
const list = (value: unknown): Json[] => (Array.isArray(value) ? value.map(obj) : [])
const text = (value: unknown): string | null => (typeof value === 'string' ? value : null)

/** Same as the search tool: the product's snippet is escaped HTML with `<mark>` around matches. */
export function plainSnippet(snippet: string | null): string | null {
  if (snippet === null) return null
  return snippet
    .replace(/<\/?mark>/g, '')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#x?27;|&#39;/g, "'")
    .replace(/&amp;/g, '&')
}

async function followUps(client: ApiClient, args: ToolArguments) {
  const limit = typeof args.limit === 'number' ? args.limit : 10
  const items = list(
    await client.get('/v1/items', { query: { status: ['OPEN', 'NUDGED', 'ESCALATED'], limit } }),
  ).slice(0, limit)
  const out = await Promise.all(
    items.map(async (item) => {
      const id = text(item.id)
      let nextStep: Json | null = null
      if (id) {
        try {
          const followUp = obj(obj(await client.get(`/v1/items/${id}`)).followUp)
          if (Object.keys(followUp).length > 0) {
            nextStep = {
              stage: text(followUp.stage),
              action: text(followUp.nextAction),
              at: text(followUp.nextActionAt),
            }
          }
        } catch (error) {
          if (isApiError(error) && (error.status === 401 || error.status === 403)) throw error
        }
      }
      return {
        id,
        title: text(item.title),
        counterparty: text(item.counterparty),
        status: text(item.status),
        expectedBy: text(item.expectedBy),
        amount:
          typeof item.amount === 'number' || typeof item.amount === 'string'
            ? String(item.amount)
            : null,
        currency: text(item.currency),
        nextStep,
      }
    }),
  )
  return { items: out, count: out.length }
}

/**
 * The mock's search is keyword-only (it has no semantic half), so a whole question rarely matches every word. When it
 * finds nothing, the demo asks again for any of the question's words, which is roughly what the real hybrid search
 * finds for a question. Live mode never does this: the MCP tool gets the question as typed.
 */
export function anyOfTheWords(query: string): string | null {
  const words = query.toLowerCase().match(/[\p{L}\p{N}]{3,}/gu) ?? []
  return words.length > 1 ? [...new Set(words)].join(' OR ') : null
}

async function search(client: ApiClient, args: ToolArguments) {
  const query = String(args.query ?? '').slice(0, MAX_QUERY)
  const k = typeof args.k === 'number' ? args.k : 5
  let response = obj(await client.get('/v1/search', { query: { q: query, k } }))
  const loose = anyOfTheWords(query)
  if (list(response.hits).length === 0 && loose && loose.length <= MAX_QUERY) {
    response = obj(await client.get('/v1/search', { query: { q: loose, k } }))
  }
  const passages = list(response.hits).map((hit, index) => ({
    rank: index + 1,
    documentId: text(hit.documentId),
    title: text(hit.title),
    sourceType: text(hit.sourceType),
    createdAt: text(hit.createdAt),
    passage: plainSnippet(text(hit.snippet)),
    score: typeof hit.score === 'number' ? hit.score : 0,
  }))
  return { query, passages, count: passages.length }
}

async function appliances(client: ApiClient, args: ToolArguments) {
  const only = typeof args.applianceId === 'string' ? args.applianceId : null
  const all = only
    ? [obj(await client.get(`/v1/appliances/${only}`))]
    : list(await client.get('/v1/appliances'))
  const shown = all.slice(0, 25)
  const out = await Promise.all(
    shown.map(async (appliance) => {
      const id = text(appliance.id)
      let health: Json | null = null
      if (id) {
        try {
          health = obj(await client.get(`/v1/appliances/${id}/health`))
        } catch (error) {
          if (isApiError(error) && (error.status === 401 || error.status === 403)) throw error
        }
      }
      return {
        id,
        name: text(appliance.name),
        type: text(appliance.type),
        location: text(appliance.location),
        underWarranty: appliance.underWarranty === true,
        serviceOverdue: appliance.serviceOverdue === true,
        lastReadingAt: health ? text(health.lastReadingAt) : null,
        health: health ? (text(health.status) ?? 'UNKNOWN') : 'UNKNOWN',
        openAlerts: health
          ? list(health.activeAlerts).map((alert) => ({
              id: text(alert.id),
              kind: text(alert.kind),
              severity: text(alert.severity),
              status: text(alert.status),
              message: text(alert.message),
              openedAt: text(alert.openedAt),
            }))
          : [],
      }
    }),
  )
  return { appliances: out, count: out.length, truncated: all.length > shown.length }
}

const FRACTION_DIGITS = (currency: string) => {
  try {
    return (
      new Intl.NumberFormat('en', { style: 'currency', currency }).resolvedOptions()
        .maximumFractionDigits ?? 2
    )
  } catch {
    return 2
  }
}

/** Minor units as a decimal string, like the tool's `balance`. */
export function majorUnits(minor: number, currency: string): string {
  const digits = FRACTION_DIGITS(currency)
  const sign = minor < 0 ? '-' : ''
  const abs = Math.abs(minor)
  if (digits === 0) return `${sign}${abs}`
  const scale = 10 ** digits
  return `${sign}${Math.floor(abs / scale)}.${String(abs % scale).padStart(digits, '0')}`
}

async function ledger(client: ApiClient, args: ToolArguments) {
  const only = typeof args.householdId === 'string' ? args.householdId : null
  const all = only
    ? [obj(await client.get(`/v1/households/${only}`))]
    : list(await client.get('/v1/households'))
  const shown = all.slice(0, 10)
  const households = await Promise.all(
    shown.map(async (household) => {
      const currency = text(household.currency) ?? 'USD'
      const accounts = list(
        await client.get(`/v1/households/${String(household.id)}/accounts`),
      ).map((account) => {
        const accountCurrency = text(account.currency) ?? currency
        const minor = typeof account.balanceMinor === 'number' ? account.balanceMinor : 0
        return {
          id: text(account.id),
          code: text(account.code),
          name: text(account.name),
          type: text(account.type),
          currency: accountCurrency,
          balanceMinor: minor,
          balance: majorUnits(minor, accountCurrency),
        }
      })
      return { id: text(household.id), name: text(household.name), currency, accounts }
    }),
  )
  return { households, count: households.length, truncated: all.length > shown.length }
}

const TOOLS: Record<ToolName, (client: ApiClient, args: ToolArguments) => Promise<unknown>> = {
  waiting_on_list_followups: followUps,
  ask_your_life_search: search,
  home_pulse_appliance_status: appliances,
  family_treasury_ledger_summary: ledger,
}

/** `clientFor(moduleId)` returns that product's (mock) API client, or null when the workspace does not host it. */
export function createDemoTransport(
  clientFor: (moduleId: string) => ApiClient | null,
): AssistantTransport {
  return async (tool, args): Promise<ToolResult> => {
    const client = clientFor(TOOL_PRODUCT[tool].moduleId)
    if (!client) return { ok: false, error: errorFor('unavailable', tool) }
    try {
      return { ok: true, data: await TOOLS[tool](client, args) }
    } catch (error) {
      const status = isApiError(error) ? error.status : 0
      if (status === 401 || status === 403)
        return { ok: false, error: errorFor('permission', tool) }
      if (status === 404) return { ok: false, error: errorFor('not_found', tool) }
      if (status >= 400 && status < 500) return { ok: false, error: errorFor('invalid', tool) }
      return { ok: false, error: errorFor('unavailable', tool) }
    }
  }
}
