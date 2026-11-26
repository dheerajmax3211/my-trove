/*
 * Which tool answers a question. There is no language model here: a question goes to a tool by the explicit word
 * rules below, checked in order, and anything they do not catch is searched in Ask Your Life.
 */

export type ToolName =
  | 'waiting_on_list_followups'
  | 'ask_your_life_search'
  | 'home_pulse_appliance_status'
  | 'family_treasury_ledger_summary'

/** The product behind each tool: its name (for "From Waiting On") and its workspace module id (for links). */
export const TOOL_PRODUCT: Record<ToolName, { title: string; moduleId: string }> = {
  waiting_on_list_followups: { title: 'Waiting On', moduleId: 'waiting-on' },
  ask_your_life_search: { title: 'Ask Your Life', moduleId: 'ask-your-life' },
  home_pulse_appliance_status: { title: 'Home Pulse', moduleId: 'home-pulse' },
  family_treasury_ledger_summary: { title: 'Family Treasury', moduleId: 'family-treasury' },
}

/** The Ask Your Life tool takes at most 500 characters. */
export const MAX_QUERY = 500

export interface IntentRule {
  tool: Exclude<ToolName, 'ask_your_life_search'>
  /** What the rule listens for, in words (shown in the panel's help). */
  words: string
  patterns: readonly RegExp[]
}

/** Checked top to bottom; the first rule with a matching pattern wins. */
export const INTENT_RULES: readonly IntentRule[] = [
  {
    tool: 'waiting_on_list_followups',
    words: 'waiting on, waiting for, follow-ups, owed',
    patterns: [/\bwaiting (on|for)\b/, /\bfollow[- ]?ups?\b/, /\bowed\b/],
  },
  {
    tool: 'home_pulse_appliance_status',
    words: 'appliance, fridge, freezer, power, alert',
    patterns: [/\bappliances?\b/, /\bfridges?\b/, /\bfreezers?\b/, /\bpower\b/, /\balerts?\b/],
  },
  {
    tool: 'family_treasury_ledger_summary',
    words: 'balance, ledger, money, household account, treasury',
    patterns: [
      /\bbalances?\b/,
      /\bledgers?\b/,
      /\bmoney\b/,
      /\bhousehold accounts?\b/,
      /\btreasury\b/,
    ],
  },
]

export type Intent =
  | { tool: Exclude<ToolName, 'ask_your_life_search'>; arguments: Record<string, never> }
  | { tool: 'ask_your_life_search'; arguments: { query: string } }

const normalise = (question: string) =>
  question.toLowerCase().replace(/[‘’]/g, "'").replace(/\s+/g, ' ').trim()

/** The tool (and its arguments) for a question, or null for an empty question. */
export function routeQuestion(question: string): Intent | null {
  const text = normalise(question)
  if (text === '') return null
  for (const rule of INTENT_RULES) {
    if (rule.patterns.some((pattern) => pattern.test(text))) {
      return { tool: rule.tool, arguments: {} }
    }
  }
  return {
    tool: 'ask_your_life_search',
    arguments: { query: question.replace(/\s+/g, ' ').trim().slice(0, MAX_QUERY) },
  }
}

/** A household the question names (case-insensitive), so the assistant need not ask which one. */
export function householdNamedIn<T extends { name: string }>(
  question: string,
  households: readonly T[],
): T | null {
  const text = normalise(question)
  const named = households.filter((household) => {
    const name = normalise(household.name)
    return name.length >= 3 && text.includes(name)
  })
  // Two households both named ("Rao" inside "The Rao family"): the longest name is the most specific.
  named.sort((a, b) => b.name.length - a.name.length)
  return named[0] ?? null
}
