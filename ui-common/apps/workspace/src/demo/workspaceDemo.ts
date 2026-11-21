import type { Persona } from '@platform/ui'
import { PERSONA_PERMISSIONS, PERSONA_PLAN, planInfo } from '../lib/personas'

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

function pathOf(input: Parameters<typeof fetch>[0]): string {
  const raw = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url
  try {
    return new URL(raw, 'http://demo.invalid').pathname
  } catch {
    return raw
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

/**
 * The workspace's own endpoints for demo mode: who am I (for the chosen demo persona) and how much
 * have I used. Everything else is a 404 problem body. Reads `persona()` on every call so switching
 * persona and re-reading `/me` is enough to change the whole workspace.
 */
export function createWorkspaceDemoFetch({ persona, now }: WorkspaceDemoOptions): typeof fetch {
  return (input) => {
    const path = pathOf(input)
    const current = persona()
    const permissions = PERSONA_PERMISSIONS[current]

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
      const perMonth = planInfo(PERSONA_PLAN[current])?.perMonth ?? 10_000
      const series = sampleSeries(now(), perMonth)
      return Promise.resolve(
        jsonResponse({
          totalRequests: series.reduce((sum, point) => sum + point.requests, 0),
          errorRate: 0.012,
          series,
        }),
      )
    }

    return notFoundDemoFetch(input)
  }
}
