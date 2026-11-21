/** problem+json helpers: the same document shapes the Spring gateway produces (RFC 9457 + `code`). */

const REASONS: Record<number, string> = {
  400: 'Bad Request',
  401: 'Unauthorized',
  404: 'Not Found',
  409: 'Conflict',
  429: 'Too Many Requests',
  500: 'Internal Server Error',
  503: 'Service Unavailable',
}

export function problem(
  status: number,
  detail: string,
  instance: string,
  extra: Record<string, unknown> = {},
): Response {
  return new Response(
    JSON.stringify({
      type: 'about:blank',
      title: REASONS[status] ?? `HTTP ${status}`,
      status,
      detail,
      instance,
      ...extra,
    }),
    { status, headers: { 'content-type': 'application/problem+json' } },
  )
}

export function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  })
}

export const noContent = () => new Response(null, { status: 204 })

/** An error a handler throws; `route` turns it into a response. */
export class HttpProblem extends Error {
  constructor(
    readonly status: number,
    readonly code: string | null,
    message: string,
    readonly extra: Record<string, unknown> = {},
  ) {
    super(message)
  }
}

export const notFound = (what: string) => new HttpProblem(404, 'NOT_FOUND', `${what} not found`)
export const badRequest = (message: string) => new HttpProblem(400, 'INVALID_REQUEST', message)
export const conflict = (code: string, message: string) => new HttpProblem(409, code, message)

/** Bean-validation failure: `errors` maps a field to its message, like the gateway's handler. */
export const validationFailed = (errors: Record<string, string>) =>
  new HttpProblem(400, 'VALIDATION_FAILED', 'Request validation failed', { errors })

/** Spring's answer to a body it cannot read (malformed JSON, an unknown enum value...). */
export const unreadable = () => new HttpProblem(400, null, 'Failed to read request')
