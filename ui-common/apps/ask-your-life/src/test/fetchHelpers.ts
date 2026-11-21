/** Small helpers for tests that need the API to misbehave. */

export const urlOf = (input: RequestInfo | URL): string =>
  typeof input === 'string' ? input : input instanceof URL ? input.href : input.url

export const jsonResponse = (body: unknown, status = 200): Response =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })

export const problemResponse = (status: number, title: string, detail: string): Response =>
  new Response(JSON.stringify({ type: 'about:blank', title, status, detail }), {
    status,
    headers: { 'content-type': 'application/problem+json' },
  })

/** Answers requests whose URL contains `path` with `respond()`; everything else goes to the mock API. */
export function intercept(
  path: string,
  respond: (init: RequestInit | undefined) => Response | Promise<Response> | null,
): (mockFetch: typeof fetch) => typeof fetch {
  return (mockFetch) => async (input, init) =>
    (urlOf(input).includes(path) ? respond(init) : null) ?? mockFetch(input, init)
}
