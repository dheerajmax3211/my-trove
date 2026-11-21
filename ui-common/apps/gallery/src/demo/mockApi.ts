/** In-memory stand-in for a backend, so the demo needs no server. Speaks problem+json like the real services. */

export interface DemoRequest {
  id: string
  title: string
  person: string
  status: 'open' | 'done'
  due: string
}

const LATENCY_MS = 250

const problem = (status: number, title: string, extra: Record<string, unknown> = {}) =>
  new Response(
    JSON.stringify({
      type: `https://platform.example/problems/${title.toLowerCase().replace(/\s+/g, '-')}`,
      title,
      status,
      ...extra,
    }),
    {
      status,
      headers: { 'content-type': 'application/problem+json' },
    },
  )

const ok = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })

export function createMockFetch(): typeof fetch {
  let seq = 4
  let requests: DemoRequest[] = [
    {
      id: 'r1',
      title: 'Signed lease addendum',
      person: 'Priya Natarajan',
      status: 'open',
      due: '2026-12-02',
    },
    { id: 'r2', title: 'Vendor W-9', person: 'Marcus Webb', status: 'open', due: '2026-11-12' },
    {
      id: 'r3',
      title: 'Updated insurance certificate',
      person: 'Dev Patel',
      status: 'done',
      due: '2026-10-30',
    },
  ]

  const handler = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const url = new URL(
      typeof input === 'string' ? input : input instanceof URL ? input.href : input.url,
      window.location.origin,
    )
    const method = (init?.method ?? 'GET').toUpperCase()
    const path = url.pathname.replace(/^\/api/, '')
    const token = new Headers(init?.headers).get('authorization')?.replace(/^Bearer /, '')

    await new Promise((r) => setTimeout(r, LATENCY_MS))

    if (!token || token.endsWith('-expired')) {
      return problem(401, 'Unauthorized', {
        detail: token ? 'The ID token has expired.' : 'Missing bearer token.',
      })
    }

    if (method === 'GET' && path === '/requests') {
      const status = url.searchParams.get('status')
      return ok(status ? requests.filter((r) => r.status === status) : requests)
    }

    if (method === 'POST' && path === '/requests') {
      const body = JSON.parse(
        typeof init?.body === 'string' ? init.body : '{}',
      ) as Partial<DemoRequest>
      const errors: Record<string, string[]> = {}
      if (!body.title || body.title.trim().length < 3)
        errors.title = ['Title must be at least 3 characters.']
      if (!body.person || body.person.trim().length < 2)
        errors.person = ['Say who this is waiting on.']
      if (Object.keys(errors).length > 0)
        return problem(422, 'Validation failed', { detail: 'Fix the highlighted fields.', errors })
      const created: DemoRequest = {
        id: `r${(seq += 1)}`,
        title: body.title!.trim(),
        person: body.person!.trim(),
        status: 'open',
        due: body.due || '2026-12-31',
      }
      requests = [created, ...requests]
      return ok(created, 201)
    }

    const complete = /^\/requests\/([^/]+)\/complete$/.exec(path)
    if (method === 'POST' && complete) {
      const target = requests.find((r) => r.id === complete[1])
      if (!target)
        return problem(404, 'Request not found', {
          detail: `No request with id ${complete[1] ?? ''}.`,
        })
      requests = requests.map((r) => (r.id === target.id ? { ...r, status: 'done' as const } : r))
      return ok({ ...target, status: 'done' })
    }

    if (path === '/boom')
      return problem(500, 'Internal error', {
        detail: 'The mock server is pretending to be broken.',
        instance: '/boom',
      })
    if (path === '/forbidden')
      return problem(403, 'Forbidden', { detail: 'You are not a member of this workspace.' })

    return problem(404, 'Not found', { detail: `${method} ${path} does not exist.` })
  }

  return handler
}
