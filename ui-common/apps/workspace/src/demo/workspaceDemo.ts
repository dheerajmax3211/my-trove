import type { Persona } from '@platform/ui'
import { PERSONA_PERMISSIONS, PERSONA_PLAN, planInfo } from '../lib/personas'
import { createDeveloperDemo, type DemoCall } from './developerDemo'

const PROBLEM_HEADERS = { 'content-type': 'application/problem+json' }

export function problemResponse(status: number, title: string, detail: string): Response {
  return new Response(JSON.stringify({ type: 'about:blank', title, status, detail }), {
    status,
    headers: PROBLEM_HEADERS,
  })
}

/** What a service without a mock backend answers in demo mode. It never reaches the network. */
export const notFoundDemoFetch: typeof fetch = () =>
  Promise.resolve(
    problemResponse(404, 'Not found', 'Demo mode has no sample data for this service.'),
  )

function jsonResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  })
}

function requestUrl(input: Parameters<typeof fetch>[0]): string {
  return typeof input === 'string' ? input : input instanceof URL ? input.href : input.url
}

function pathOf(input: Parameters<typeof fetch>[0]): string {
  const raw = requestUrl(input)
  try {
    return new URL(raw, 'http://demo.invalid').pathname
  } catch {
    return raw
  }
}

/** The path below `/api` with its query string, which is how the demo developer API matches its routes. */
function apiPathOf(input: Parameters<typeof fetch>[0]): string {
  const raw = requestUrl(input)
  try {
    const url = new URL(raw, 'http://demo.invalid')
    return `${url.pathname.replace(/^\/api(?=\/|$)/, '')}${url.search}`
  } catch {
    return raw
  }
}

function parseJson(text: unknown): unknown {
  if (typeof text !== 'string') return undefined
  try {
    return JSON.parse(text)
  } catch {
    return undefined
  }
}

export interface WorkspaceDemoOptions {
  persona: () => Persona
  now: () => Date
}

/** Deterministic sample usage: a gentle weekday rhythm that grows through the month. */
function sampleSeries(now: Date, perMonth: number) {
  const days = now.getUTCDate()
  const weights = Array.from({ length: days }, (_, i) => 0.6 + ((i * 7) % 5) * 0.2)
  const target = Math.round(perMonth * 0.42)
  const sum = weights.reduce((a, b) => a + b, 0)
  const start = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)
  return weights.map((weight, i) => {
    const requests = Math.round((weight / sum) * target)
    return {
      ts: new Date(start + i * 86_400_000).toISOString(),
      requests,
      errors: Math.round(requests * 0.012),
    }
  })
}

function usageBody(persona: Persona, now: Date) {
  const perMonth = planInfo(PERSONA_PLAN[persona])?.perMonth ?? 10_000
  const series = sampleSeries(now, perMonth)
  return {
    totalRequests: series.reduce((sum, point) => sum + point.requests, 0),
    errorRate: 0.012,
    series,
  }
}

/**
 * The workspace's own endpoints for demo mode: who am I (for the chosen demo persona), how much have I used, and the
 * developer platform (apps, keys, webhooks, docs) and the owner's consent grants, answered from memory. Everything else
 * is a 404 problem body. Reads `persona()` on every call so switching persona and re-reading `/me` is enough to change
 * the whole workspace.
 */
export function createWorkspaceDemoFetch({ persona, now }: WorkspaceDemoOptions): typeof fetch {
  const developer = createDeveloperDemo({
    now,
    usage: () => usageBody(persona(), now()),
  })

  return (input, init) => {
    const path = pathOf(input)
    const current = persona()
    const permissions = PERSONA_PERMISSIONS[current]

    const authorization = new Headers(init?.headers).get('authorization') ?? ''
    const bearer = authorization.startsWith('Bearer ') ? authorization.slice(7) : undefined
    const call: DemoCall = {
      method: (init?.method ?? 'GET').toUpperCase(),
      path: apiPathOf(input),
      body: parseJson(init?.body),
      permissions,
      plan: PERSONA_PLAN[current],
      ...(bearer ? { bearer } : {}),
    }
    const developerAnswer = developer.handle(call)
    if (developerAnswer) return Promise.resolve(developerAnswer)

    if (path.endsWith('/auth/v1/me')) {
      return Promise.resolve(
        jsonResponse({
          id: 'demo-user',
          email: 'demo@example.test',
          displayName: 'Demo User',
          roles: [current],
          permissions: [...permissions],
          plan: PERSONA_PLAN[current],
        }),
      )
    }

    if (path.endsWith('/platform/v1/usage/me')) {
      if (!permissions.includes('usage:read:self')) {
        return Promise.resolve(
          problemResponse(403, 'Forbidden', 'Your role does not include usage:read:self.'),
        )
      }
      return Promise.resolve(jsonResponse(usageBody(current, now())))
    }

    return notFoundDemoFetch(input)
  }
}
