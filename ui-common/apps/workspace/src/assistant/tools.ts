/*
 * The four MCP tools' answers (`structuredContent`, as mcp-server returns them) and how a failure reads. The parsers
 * accept anything and return null for a shape they cannot read, so a surprising answer never breaks the page.
 */
import { TOOL_PRODUCT, type ToolName } from './intent'

export interface FollowUpRow {
  id: string
  title: string
  counterparty: string | null
  status: string
  expectedBy: string | null
  amount: string | null
  currency: string | null
  nextStep: { stage: string | null; action: string | null; at: string | null } | null
}
export interface FollowUps {
  items: FollowUpRow[]
}

export interface Passage {
  rank: number
  documentId: string | null
  title: string
  sourceType: string | null
  createdAt: string | null
  passage: string
  score: number
}
export interface SearchAnswer {
  query: string
  passages: Passage[]
}

export interface ApplianceAlert {
  id: string | null
  kind: string | null
  severity: string | null
  message: string
}
export interface ApplianceRow {
  id: string
  name: string
  type: string | null
  location: string | null
  health: string
  openAlerts: ApplianceAlert[]
}
export interface ApplianceStatus {
  appliances: ApplianceRow[]
  truncated: boolean
}

export interface LedgerAccount {
  id: string | null
  name: string
  type: string | null
  currency: string
  balanceMinor: number
  balance: string
}
export interface LedgerHousehold {
  id: string
  name: string
  currency: string
  accounts: LedgerAccount[]
}
export interface LedgerSummary {
  households: LedgerHousehold[]
  truncated: boolean
}

export type ToolArguments = Record<string, string | number>

export type ErrorKind =
  'permission' | 'unavailable' | 'not_found' | 'invalid' | 'signed_out' | 'unreadable'

export interface AssistantError {
  kind: ErrorKind
  /** A sentence for the person, never a code or a stack trace. */
  message: string
}

export type ToolResult = { ok: true; data: unknown } | { ok: false; error: AssistantError }

/** Calls one tool. Never throws: every failure comes back as `{ ok: false }`. */
export type AssistantTransport = (tool: ToolName, args: ToolArguments) => Promise<ToolResult>

/** The sentence for a failure of one tool. */
export function errorFor(kind: ErrorKind, tool: ToolName): AssistantError {
  const product = TOOL_PRODUCT[tool].title
  const message: Record<ErrorKind, string> = {
    permission: `You don't have permission to read ${product}, so the assistant can't answer that.`,
    unavailable: `${product} isn't answering right now. Try again in a minute.`,
    not_found: `${product} couldn't find that.`,
    invalid: `${product} couldn't take that question as asked. Try saying it another way.`,
    signed_out: 'Your session has ended. Sign in again to ask the assistant.',
    unreadable: `${product} answered in a way the assistant can't read.`,
  }
  return { kind, message: message[kind] }
}

// ---- parsing -----------------------------------------------------------------------------------------------

type Json = Record<string, unknown>
const obj = (value: unknown): Json | null =>
  typeof value === 'object' && value !== null && !Array.isArray(value) ? (value as Json) : null
const list = (value: unknown): unknown[] => (Array.isArray(value) ? value : [])
const text = (value: unknown): string | null =>
  typeof value === 'string' && value !== '' ? value : null
const num = (value: unknown): number | null =>
  typeof value === 'number' && Number.isFinite(value) ? value : null

const rows = <T>(value: unknown, parse: (row: Json) => T | null): T[] =>
  list(value)
    .map((entry) => {
      const row = obj(entry)
      return row ? parse(row) : null
    })
    .filter((row): row is T => row !== null)

export function parseFollowUps(data: unknown): FollowUps | null {
  const root = obj(data)
  if (!root || !Array.isArray(root.items)) return null
  return {
    items: rows(root.items, (row) => {
      const id = text(row.id)
      const title = text(row.title)
      if (!id || !title) return null
      const next = obj(row.nextStep)
      return {
        id,
        title,
        counterparty: text(row.counterparty),
        status: text(row.status) ?? 'OPEN',
        expectedBy: text(row.expectedBy),
        amount: text(row.amount),
        currency: text(row.currency),
        nextStep: next
          ? { stage: text(next.stage), action: text(next.action), at: text(next.at) }
          : null,
      }
    }),
  }
}

export function parseSearch(data: unknown): SearchAnswer | null {
  const root = obj(data)
  if (!root || !Array.isArray(root.passages)) return null
  return {
    query: text(root.query) ?? '',
    passages: rows(root.passages, (row) => {
      const passage = text(row.passage)
      if (!passage) return null
      return {
        rank: num(row.rank) ?? 0,
        documentId: text(row.documentId),
        title: text(row.title) ?? 'Untitled',
        sourceType: text(row.sourceType),
        createdAt: text(row.createdAt),
        passage,
        score: num(row.score) ?? 0,
      }
    }),
  }
}

export function parseAppliances(data: unknown): ApplianceStatus | null {
  const root = obj(data)
  if (!root || !Array.isArray(root.appliances)) return null
  return {
    truncated: root.truncated === true,
    appliances: rows(root.appliances, (row) => {
      const id = text(row.id)
      const name = text(row.name)
      if (!id || !name) return null
      return {
        id,
        name,
        type: text(row.type),
        location: text(row.location),
        health: text(row.health) ?? 'UNKNOWN',
        openAlerts: rows(row.openAlerts, (alert) => {
          const message = text(alert.message)
          if (!message) return null
          return {
            id: text(alert.id),
            kind: text(alert.kind),
            severity: text(alert.severity),
            message,
          }
        }),
      }
    }),
  }
}

export function parseLedger(data: unknown): LedgerSummary | null {
  const root = obj(data)
  if (!root || !Array.isArray(root.households)) return null
  return {
    truncated: root.truncated === true,
    households: rows(root.households, (row) => {
      const id = text(row.id)
      const name = text(row.name)
      if (!id || !name) return null
      const currency = text(row.currency) ?? 'USD'
      return {
        id,
        name,
        currency,
        accounts: rows(row.accounts, (account) => {
          const accountName = text(account.name)
          const minor = num(account.balanceMinor)
          if (!accountName || minor === null) return null
          return {
            id: text(account.id),
            name: accountName,
            type: text(account.type),
            currency: text(account.currency) ?? currency,
            balanceMinor: minor,
            balance: text(account.balance) ?? String(minor / 100),
          }
        }),
      }
    }),
  }
}
