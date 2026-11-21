/** Error and response shapes of the real services, so the UI meets the same failures in demo mode. */

const REASONS: Record<number, string> = {
  400: 'Bad Request',
  401: 'Unauthorized',
  403: 'Forbidden',
  404: 'Not Found',
  409: 'Conflict',
  410: 'Gone',
  413: 'Content Too Large',
}

/**
 * - `problem`: shared-service (Spring `ProblemDetail`, RFC 9457, with a `detail`).
 * - `boot`: auth-service (`ResponseStatusException` through Boot's default error body, which hides the message).
 * - `empty`: Spring Security rejections (no body at all).
 */
export type ErrorStyle = 'problem' | 'boot' | 'empty'

export class HttpError extends Error {
  readonly status: number
  readonly style: ErrorStyle

  constructor(status: number, message: string, style: ErrorStyle = 'problem') {
    super(message)
    this.status = status
    this.style = style
  }
}

export const jsonResponse = (body: unknown, status = 200): Response =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  })

export const noContent = (): Response => new Response(null, { status: 204 })

export function errorResponse(error: HttpError, path: string): Response {
  const reason = REASONS[error.status] ?? 'Error'
  if (error.style === 'empty') return new Response(null, { status: error.status })
  if (error.style === 'boot') {
    return new Response(
      JSON.stringify({
        timestamp: new Date().toISOString(),
        status: error.status,
        error: reason,
        path,
      }),
      { status: error.status, headers: { 'content-type': 'application/json' } },
    )
  }
  return new Response(
    JSON.stringify({
      type: 'about:blank',
      title: reason,
      status: error.status,
      detail: error.message,
      instance: path,
    }),
    { status: error.status, headers: { 'content-type': 'application/problem+json' } },
  )
}
