/** Spring's ProblemDetail bodies, as the home-pulse service sends them. */

const TITLES: Record<number, string> = {
  400: 'Bad Request',
  401: 'Unauthorized',
  404: 'Not Found',
  409: 'Conflict',
}

export function problem(status: number, detail: string, instance: string): Response {
  return new Response(
    JSON.stringify({
      type: 'about:blank',
      title: TITLES[status] ?? 'Error',
      status,
      detail,
      instance,
    }),
    { status, headers: { 'content-type': 'application/problem+json' } },
  )
}

export const json = (body: unknown, status = 200): Response =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })

export const noContent = (status = 204): Response => new Response(null, { status })
