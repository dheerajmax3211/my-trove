import {
  DEVELOPER_PATH,
  paths,
  type ConnectedGrant,
  type CreatedApp,
  type CreatedWebhook,
  type Delivery,
  type DeveloperApp,
  type ApiKey,
  type IssuedKey,
  type WebhookEndpoint,
} from '../developer/contract'
import { limitsFor } from '../developer/limits'
import { MAX_REDIRECT_URIS, validateCallbackUrl } from '../developer/urls'

/**
 * The developer platform and the owner's consent grants, answered from memory for demo mode. It keeps the same contract
 * as the live services (status codes, problem bodies, the one-time secrets, the plan limits, and the gateway's messages
 * for API keys) and never touches the network. State lives as long as the demo runtime does.
 */

export interface DemoCall {
  method: string
  /** Path below `/api`, e.g. `/platform/v1/developer/apps`. May carry a query string. */
  path: string
  /** Parsed JSON body, when there is one. */
  body?: unknown
  /** The signed-in persona's permissions. */
  permissions: readonly string[]
  /** The persona's plan, e.g. `FREE`. */
  plan: string
  /** The raw value of an `Authorization: Bearer` header, when the caller sent one (API keys). */
  bearer?: string
}

export interface DeveloperDemoOptions {
  now: () => Date
  /** The sample usage answer `GET /platform/v1/usage/me` gives to an API key with usage:read. */
  usage: () => unknown
}

export interface DeveloperDemo {
  /** The response for a call this module owns, or null when the call is somebody else's. */
  handle: (call: DemoCall) => Response | null
}

const SCOPES = [
  {
    name: 'usage:read',
    description: 'Read your own usage and request counts (GET /v1/usage/me)',
    permissions: ['usage:read:self'],
  },
]

const EVENT_TYPES = [
  { name: 'reminder.created', description: 'A reminder was created in a household or product' },
  { name: 'approval.decided', description: 'An approval request was approved or declined' },
  { name: 'consent.granted', description: 'A user granted a connected app access to their data' },
  { name: 'consent.revoked', description: "A user revoked a connected app's access" },
]

const SERVICES = [
  'auth',
  'ask-your-life',
  'home-pulse',
  'consent',
  'shared',
  'family-treasury',
  'waiting-on',
  'digital-legacy',
  'platform',
]

const LIMITS_NAME = (plan: string) => plan.toUpperCase()

function hex(bytes: number): string {
  const values = new Uint8Array(bytes)
  crypto.getRandomValues(values)
  return Array.from(values, (b) => b.toString(16).padStart(2, '0')).join('')
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  })
}

function empty(status: number): Response {
  return new Response(null, { status })
}

function problem(status: number, title: string, detail: string): Response {
  return new Response(JSON.stringify({ type: 'about:blank', title, status, detail }), {
    status,
    headers: { 'content-type': 'application/problem+json' },
  })
}

interface AppRow {
  app: DeveloperApp
  secret: string | null
}

interface KeyRow {
  view: ApiKey
  /** The whole key. Kept only here, so the demo can check a bearer the way the gateway does. */
  key: string
  expiresAt: Date | null
}

interface HookRow {
  view: WebhookEndpoint
  secret: string
}

interface Route {
  method: string
  pattern: RegExp
  run: (match: RegExpMatchArray, call: DemoCall) => Response
}

export function createDeveloperDemo({ now, usage }: DeveloperDemoOptions): DeveloperDemo {
  const apps: AppRow[] = []
  const keys: KeyRow[] = []
  const hooks: HookRow[] = []
  const deliveries: (Delivery & { endpointId: string })[] = []
  const grants: ConnectedGrant[] = []
  const iso = () => now().toISOString()

  // A sample app and a sample grant, so every screen has something to show in demo mode.
  const sampleAt = new Date(now().getTime() - 3 * 86_400_000).toISOString()
  apps.push({
    app: {
      id: crypto.randomUUID(),
      clientId: `app_${hex(12)}`,
      name: 'Sample app (demo)',
      description: 'Seeded so the console has something to show in demo mode.',
      redirectUris: ['https://sample.example.test/callback'],
      hasClientSecret: false,
      secretRotatedAt: null,
      createdAt: sampleAt,
      updatedAt: sampleAt,
      revokedAt: null,
    },
    secret: null,
  })
  grants.push({
    id: crypto.randomUUID(),
    clientId: `app_${hex(12)}`,
    clientName: 'Sample planner (demo)',
    scopes: ['reminders:read'],
    purpose: 'Show your reminders next to its own calendar',
    maxSensitivity: 'LOW',
    createdAt: sampleAt,
    expiresAt: new Date(now().getTime() + 30 * 86_400_000).toISOString(),
    maxReads: null,
    readsUsed: 4,
    revokedAt: null,
    lastReadAt: sampleAt,
    status: 'ACTIVE',
  })

  const appRow = (id: string) => apps.find((row) => row.app.id === id)
  const liveKeys = () =>
    keys.filter(
      (row) => row.view.revokedAt === null && (row.expiresAt === null || row.expiresAt > now()),
    )
  const liveHooks = () => hooks.filter((row) => row.view.disabledAt === null)

  function checkBody(body: unknown): Record<string, unknown> | null {
    return typeof body === 'object' && body !== null && !Array.isArray(body)
      ? (body as Record<string, unknown>)
      : null
  }

  function appFields(
    raw: Record<string, unknown>,
  ): { name: string; description: string; redirectUris: string[] } | Response {
    const name = typeof raw.name === 'string' ? raw.name.trim() : ''
    if (name === '' || name.length > 80)
      return problem(400, 'Bad Request', 'name must be between 1 and 80 characters')
    const description = typeof raw.description === 'string' ? raw.description : ''
    if (description.length > 500)
      return problem(400, 'Bad Request', 'description must be at most 500 characters')
    const uris = Array.isArray(raw.redirectUris) ? raw.redirectUris : []
    if (uris.length > MAX_REDIRECT_URIS) {
      return problem(
        400,
        'Bad Request',
        `redirectUris must have at most ${MAX_REDIRECT_URIS} entries`,
      )
    }
    for (const uri of uris) {
      const problemText = typeof uri === 'string' ? validateCallbackUrl(uri) : 'Enter an address.'
      if (problemText) return problem(400, 'Bad Request', `${String(uri)}: ${problemText}`)
    }
    return { name, description, redirectUris: uris as string[] }
  }

  function sampleDelivery(endpointId: string, eventType: string): void {
    deliveries.push({
      id: crypto.randomUUID(),
      endpointId,
      eventId: crypto.randomUUID(),
      eventType,
      status: 'DELIVERED',
      attempts: 1,
      nextAttemptAt: null,
      lastStatusCode: 200,
      lastError: null,
      createdAt: iso(),
      deliveredAt: iso(),
      replayOf: null,
    })
  }

  const routes: Route[] = [
    {
      method: 'GET',
      pattern: /^\/platform\/v1\/developer\/apps$/,
      run: (_m, call) => needs(call, 'apps:manage') ?? json(apps.map((row) => row.app)),
    },
    {
      method: 'POST',
      pattern: /^\/platform\/v1\/developer\/apps$/,
      run: (_m, call) => {
        const denied = needs(call, 'apps:manage')
        if (denied) return denied
        const raw = checkBody(call.body)
        const fields = raw
          ? appFields(raw)
          : problem(400, 'Bad Request', 'The request body must be an object')
        if (fields instanceof Response) return fields
        const secret = `cs_${hex(24)}`
        const createdAt = iso()
        const row: AppRow = {
          app: {
            id: crypto.randomUUID(),
            clientId: `app_${hex(12)}`,
            name: fields.name,
            description: fields.description,
            redirectUris: fields.redirectUris,
            hasClientSecret: true,
            secretRotatedAt: null,
            createdAt,
            updatedAt: createdAt,
            revokedAt: null,
          },
          secret,
        }
        apps.push(row)
        const created: CreatedApp = {
          id: row.app.id,
          clientId: row.app.clientId,
          clientSecret: secret,
          name: row.app.name,
          description: row.app.description,
          redirectUris: row.app.redirectUris,
          createdAt,
        }
        return json(created, 201)
      },
    },
    {
      method: 'GET',
      pattern: /^\/platform\/v1\/developer\/apps\/([^/]+)$/,
      run: (m, call) => {
        const denied = needs(call, 'apps:manage')
        if (denied) return denied
        const row = appRow(m[1]!)
        return row ? json(row.app) : notFound('developer app', m[1]!)
      },
    },
    {
      method: 'PUT',
      pattern: /^\/platform\/v1\/developer\/apps\/([^/]+)$/,
      run: (m, call) => {
        const denied = needs(call, 'apps:manage')
        if (denied) return denied
        const row = appRow(m[1]!)
        if (!row) return notFound('developer app', m[1]!)
        if (row.app.revokedAt) return problem(409, 'Conflict', 'This app is revoked')
        const raw = checkBody(call.body)
        const fields = raw
          ? appFields(raw)
          : problem(400, 'Bad Request', 'The request body must be an object')
        if (fields instanceof Response) return fields
        Object.assign(row.app, fields, { updatedAt: iso() })
        return json(row.app)
      },
    },
    {
      method: 'POST',
      pattern: /^\/platform\/v1\/developer\/apps\/([^/]+)\/client-secret\/rotate$/,
      run: (m, call) => {
        const denied = needs(call, 'apps:manage')
        if (denied) return denied
        const row = appRow(m[1]!)
        if (!row) return notFound('developer app', m[1]!)
        if (row.app.revokedAt) return problem(409, 'Conflict', 'This app is revoked')
        row.secret = `cs_${hex(24)}`
        row.app.hasClientSecret = true
        row.app.secretRotatedAt = iso()
        return json({
          id: row.app.id,
          clientId: row.app.clientId,
          clientSecret: row.secret,
          rotatedAt: row.app.secretRotatedAt,
        })
      },
    },
    {
      method: 'POST',
      pattern: /^\/platform\/v1\/developer\/apps\/([^/]+)\/client-secret\/revoke$/,
      run: (m, call) => {
        const denied = needs(call, 'apps:manage')
        if (denied) return denied
        const row = appRow(m[1]!)
        if (!row) return notFound('developer app', m[1]!)
        row.secret = null
        row.app.hasClientSecret = false
        return empty(204)
      },
    },
    {
      method: 'DELETE',
      pattern: /^\/platform\/v1\/developer\/apps\/([^/]+)$/,
      run: (m, call) => {
        const denied = needs(call, 'apps:manage')
        if (denied) return denied
        const row = appRow(m[1]!)
        if (!row) return notFound('developer app', m[1]!)
        row.app.revokedAt = iso()
        for (const key of keys) if (key.view.appId === row.app.id) key.view.revokedAt ??= iso()
        return empty(204)
      },
    },
    {
      method: 'GET',
      pattern: /^\/platform\/v1\/developer\/apps\/([^/]+)\/keys$/,
      run: (m, call) => {
        const denied = needs(call, 'keys:manage')
        if (denied) return denied
        const row = appRow(m[1]!)
        if (!row) return notFound('developer app', m[1]!)
        return json(keys.filter((key) => key.view.appId === row.app.id).map((key) => key.view))
      },
    },
    {
      method: 'POST',
      pattern: /^\/platform\/v1\/developer\/apps\/([^/]+)\/keys$/,
      run: (m, call) => {
        const denied = needs(call, 'keys:manage')
        if (denied) return denied
        const row = appRow(m[1]!)
        if (!row) return notFound('developer app', m[1]!)
        if (row.app.revokedAt) return problem(409, 'Conflict', 'This app is revoked')
        const raw = checkBody(call.body) ?? {}
        const name = typeof raw.name === 'string' ? raw.name.trim() : ''
        if (name === '' || name.length > 80)
          return problem(400, 'Bad Request', 'name must be between 1 and 80 characters')
        const scopes = Array.isArray(raw.scopes) ? (raw.scopes as unknown[]) : []
        if (scopes.length === 0) return problem(400, 'Bad Request', 'scopes must not be empty')
        for (const scope of scopes) {
          if (!SCOPES.some((known) => known.name === scope)) {
            return problem(400, 'Bad Request', `Unknown scope '${String(scope)}'`)
          }
        }
        const limit = limitsFor(call.plan).keys
        if (liveKeys().length >= limit) {
          return problem(
            409,
            'Conflict',
            `Your ${LIMITS_NAME(call.plan)} plan allows ${limit} active API keys; revoke one first`,
          )
        }
        const key = `pk_${hex(4)}_${hex(32)}`
        const createdAt = iso()
        const expiresAt = typeof raw.expiresAt === 'string' ? raw.expiresAt : null
        const view: ApiKey = {
          id: crypto.randomUUID(),
          appId: row.app.id,
          name,
          keyPrefix: key.slice(0, 11),
          scopes: scopes as string[],
          createdAt,
          lastUsedAt: null,
          expiresAt,
          revokedAt: null,
        }
        keys.push({ view, key, expiresAt: expiresAt ? new Date(expiresAt) : null })
        const issued: IssuedKey = {
          id: view.id,
          appId: view.appId,
          name: view.name,
          keyPrefix: view.keyPrefix,
          key,
          scopes: view.scopes,
          createdAt,
          expiresAt,
        }
        return json(issued, 201)
      },
    },
    {
      method: 'DELETE',
      pattern: /^\/platform\/v1\/developer\/keys\/([^/]+)$/,
      run: (m, call) => {
        const denied = needs(call, 'keys:manage')
        if (denied) return denied
        const row = keys.find((key) => key.view.id === m[1])
        if (!row) return notFound('API key', m[1]!)
        row.view.revokedAt ??= iso()
        return empty(204)
      },
    },
    {
      method: 'GET',
      pattern: /^\/platform\/v1\/developer\/scopes$/,
      run: (_m, call) => needs(call, 'keys:manage') ?? json(SCOPES),
    },
    {
      method: 'GET',
      pattern: /^\/platform\/v1\/developer\/webhook-events$/,
      run: (_m, call) => needs(call, 'webhooks:manage') ?? json(EVENT_TYPES),
    },
    {
      method: 'GET',
      pattern: /^\/platform\/v1\/developer\/apps\/([^/]+)\/webhooks$/,
      run: (m, call) => {
        const denied = needs(call, 'webhooks:manage')
        if (denied) return denied
        const row = appRow(m[1]!)
        if (!row) return notFound('developer app', m[1]!)
        return json(hooks.filter((hook) => hook.view.appId === row.app.id).map((hook) => hook.view))
      },
    },
    {
      method: 'POST',
      pattern: /^\/platform\/v1\/developer\/apps\/([^/]+)\/webhooks$/,
      run: (m, call) => {
        const denied = needs(call, 'webhooks:manage')
        if (denied) return denied
        const row = appRow(m[1]!)
        if (!row) return notFound('developer app', m[1]!)
        if (row.app.revokedAt) return problem(409, 'Conflict', 'This app is revoked')
        const raw = checkBody(call.body) ?? {}
        const url = typeof raw.url === 'string' ? raw.url : ''
        const urlProblem = validateCallbackUrl(url)
        if (urlProblem) return problem(400, 'Bad Request', urlProblem)
        const description = typeof raw.description === 'string' ? raw.description : ''
        if (description.length > 200)
          return problem(400, 'Bad Request', 'description must be at most 200 characters')
        const eventTypes = Array.isArray(raw.eventTypes) ? (raw.eventTypes as unknown[]) : []
        if (eventTypes.length === 0)
          return problem(400, 'Bad Request', 'eventTypes must not be empty')
        for (const type of eventTypes) {
          if (!EVENT_TYPES.some((known) => known.name === type)) {
            return problem(400, 'Bad Request', `Unknown event type '${String(type)}'`)
          }
        }
        const limit = limitsFor(call.plan).webhooks
        if (liveHooks().length >= limit) {
          return problem(
            409,
            'Conflict',
            `Your ${LIMITS_NAME(call.plan)} plan allows ${limit} active webhook endpoints; disable one first`,
          )
        }
        const view: WebhookEndpoint = {
          id: crypto.randomUUID(),
          appId: row.app.id,
          url,
          description,
          eventTypes: eventTypes as string[],
          createdAt: iso(),
          disabledAt: null,
        }
        const secret = `whsec_${hex(24)}`
        hooks.push({ view, secret })
        sampleDelivery(view.id, view.eventTypes[0]!)
        const created: CreatedWebhook = { ...view, secret }
        return json(created, 201)
      },
    },
    {
      method: 'DELETE',
      pattern: /^\/platform\/v1\/developer\/webhooks\/([^/]+)$/,
      run: (m, call) => {
        const denied = needs(call, 'webhooks:manage')
        if (denied) return denied
        const row = hooks.find((hook) => hook.view.id === m[1])
        if (!row) return notFound('endpoint', m[1]!)
        row.view.disabledAt ??= iso()
        return empty(204)
      },
    },
    {
      method: 'POST',
      pattern: /^\/platform\/v1\/developer\/webhooks\/([^/]+)\/secret\/rotate$/,
      run: (m, call) => {
        const denied = needs(call, 'webhooks:manage')
        if (denied) return denied
        const row = hooks.find((hook) => hook.view.id === m[1])
        if (!row) return notFound('endpoint', m[1]!)
        row.secret = `whsec_${hex(24)}`
        return json({ id: row.view.id, secret: row.secret, rotatedAt: iso() })
      },
    },
    {
      method: 'GET',
      pattern: /^\/platform\/v1\/developer\/webhooks\/([^/]+)\/deliveries$/,
      run: (m, call) => {
        const denied = needs(call, 'webhooks:manage')
        if (denied) return denied
        const row = hooks.find((hook) => hook.view.id === m[1])
        if (!row) return notFound('endpoint', m[1]!)
        // The demo has no worker: a replayed delivery is "sent" the first time its log is read.
        for (const delivery of deliveries) {
          if (delivery.endpointId === row.view.id && delivery.status === 'PENDING') {
            delivery.status = 'DELIVERED'
            delivery.attempts = 1
            delivery.lastStatusCode = 200
            delivery.deliveredAt = iso()
          }
        }
        const log = deliveries
          .filter((delivery) => delivery.endpointId === row.view.id)
          .slice()
          .reverse()
          .slice(0, 100)
        return json(log.map(({ endpointId: _endpoint, ...delivery }) => delivery))
      },
    },
    {
      method: 'POST',
      pattern: /^\/platform\/v1\/developer\/webhooks\/([^/]+)\/deliveries\/([^/]+)\/replay$/,
      run: (m, call) => {
        const denied = needs(call, 'webhooks:manage')
        if (denied) return denied
        const original = deliveries.find((d) => d.id === m[2] && d.endpointId === m[1])
        if (!original) return notFound('delivery', m[2]!)
        const replay: Delivery & { endpointId: string } = {
          ...original,
          id: crypto.randomUUID(),
          status: 'PENDING',
          attempts: 0,
          nextAttemptAt: iso(),
          lastStatusCode: null,
          lastError: null,
          createdAt: iso(),
          deliveredAt: null,
          replayOf: original.id,
        }
        deliveries.push(replay)
        const { endpointId: _endpoint, ...view } = replay
        return json(view, 202)
      },
    },
  ]

  function needs(call: DemoCall, permission: string): Response | null {
    return call.permissions.includes(permission)
      ? null
      : problem(403, 'Forbidden', `This route requires the permission '${permission}'.`)
  }

  function notFound(what: string, id: string): Response {
    return problem(404, 'Not Found', `No ${what} with id ${id}`)
  }

  /** The gateway's rule for an API key: a valid key, on a route its scopes open, with the permission the route needs. */
  function keyCall(call: DemoCall): Response {
    const row = keys.find((key) => key.key === call.bearer)
    const expired = row?.expiresAt ? row.expiresAt <= now() : false
    if (!row || row.view.revokedAt !== null || expired) {
      return problem(401, 'Unauthorized', 'This API key is not valid, has expired or was revoked.')
    }
    const app = appRow(row.view.appId)
    if (!app || app.app.revokedAt)
      return problem(401, 'Unauthorized', 'The app of this API key was revoked.')
    if (call.method !== 'GET' || call.path.split('?')[0] !== paths.usage) {
      return problem(
        403,
        'Forbidden',
        'API keys cannot call this route. Only the routes listed for keys are open to them.',
      )
    }
    if (!row.view.scopes.includes('usage:read')) {
      return problem(
        403,
        'Forbidden',
        "This API key lacks the permission 'usage:read:self' that this route requires.",
      )
    }
    row.view.lastUsedAt = iso()
    return json(usage())
  }

  return {
    handle(call) {
      const pathOnly = call.path.split('?')[0]!.replace(/\/+$/, '') || '/'
      if (call.bearer?.startsWith('pk_')) return keyCall({ ...call, path: pathOnly })

      if (pathOnly === paths.docs) {
        return json({
          services: SERVICES.map((name) => ({
            name,
            available: name === 'platform',
            docsPath: `/api/${name}/v3/api-docs`,
          })),
        })
      }

      if (pathOnly === paths.grants) {
        if (!call.permissions.includes('connections:manage')) {
          return problem(
            403,
            'Forbidden',
            "This route requires the permission 'connections:manage'.",
          )
        }
        const includeInactive = /(^|[?&])includeInactive=true(&|$)/.test(call.path)
        return json(grants.filter((grant) => includeInactive || grant.revokedAt === null))
      }
      const revoke = /^\/consent\/v1\/owner\/grants\/([^/]+)\/revoke$/.exec(pathOnly)
      if (revoke && call.method === 'POST') {
        if (!call.permissions.includes('connections:manage')) {
          return problem(
            403,
            'Forbidden',
            "This route requires the permission 'connections:manage'.",
          )
        }
        const grant = grants.find((g) => g.id === revoke[1])
        if (!grant) return problem(404, 'Not Found', `No grant with id ${revoke[1]}`)
        grant.revokedAt ??= iso()
        grant.status = 'REVOKED'
        return json(grant)
      }

      if (!pathOnly.startsWith(DEVELOPER_PATH)) return null
      const route = routes.find((r) => r.method === call.method && r.pattern.test(pathOnly))
      if (!route) return problem(404, 'Not Found', `No route ${call.method} ${pathOnly}`)
      return route.run(pathOnly.match(route.pattern)!, { ...call, path: pathOnly })
    },
  }
}
