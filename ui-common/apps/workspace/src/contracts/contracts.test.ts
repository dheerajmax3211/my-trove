/**
 * Demo-mode contract suite: every product's in-memory mock API (what `?demo=1` answers from) must return the same
 * shapes as the real services. Both sides validate against the same files in `/contracts` at the repo root; the
 * service half lives in each service's `*ContractTest`.
 */
import type { ProductModule } from '@platform/workspace-kit'
import { describe, expect, it } from 'vitest'
import { productModule as askYourLife } from '@platform/ask-your-life/module'
import { productModule as consent } from '@platform/consent/module'
import { productModule as digitalLegacy } from '@platform/digital-legacy/module'
import { armedScenario } from '@platform/digital-legacy/testing/scenario'
import { productModule as homePulse } from '@platform/home-pulse/module'
import { productModule as waitingOn } from '@platform/waiting-on/module'
import { validate, type Schema } from './validate'

const files = import.meta.glob<Schema>('../../../../../contracts/*/*.schema.json', {
  eager: true,
  import: 'default',
})

/** Contract files of one service folder, keyed by file name. */
function folder(service: string): Map<string, Schema> {
  const map = new Map<string, Schema>()
  for (const [path, schema] of Object.entries(files)) {
    const match = /\/contracts\/([^/]+)\/([^/]+)$/.exec(path)
    if (match && match[1] === service) map.set(match[2] ?? '', schema)
  }
  return map
}

const API = 'http://localhost/api'

/** Calls a module's demo API the way the workspace does (`${apiBase}/${service}`) and returns the JSON body. */
function client(module: ProductModule) {
  const demoFetch = module.createDemoFetch?.()
  if (!demoFetch) throw new Error(`${module.id} has no demo API`)
  return async (method: string, path: string, body?: unknown): Promise<unknown> => {
    const response = await demoFetch(`${API}/${module.service}${path}`, {
      method,
      headers: {
        authorization: 'Bearer demo',
        accept: 'application/json',
        ...(body === undefined ? {} : { 'content-type': 'application/json' }),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    })
    const text = await response.text()
    if (!response.ok) throw new Error(`${method} ${path}: ${response.status} ${text}`)
    return JSON.parse(text) as unknown
  }
}

/** Validates and, for lists, refuses an empty array: an empty list would prove nothing about the element shape. */
function expectContract(service: string, file: string, body: unknown) {
  if (Array.isArray(body)) expect(body.length, `${file}: empty list proves nothing`).toBeGreaterThan(0)
  expect(validate(folder(service), file, body)).toEqual([])
}

describe('every contract file is used and well formed', () => {
  it('finds the contract folders', () => {
    expect(Object.keys(files).length).toBeGreaterThan(0)
  })
})

describe('waiting-on demo API', () => {
  const call = client(waitingOn)

  it('GET /v1/items (home, Today) and each item', async () => {
    const items = (await call('GET', '/v1/items')) as { id: string; status: string }[]
    expectContract('waiting-on', 'item-list.schema.json', items)
    const closed = await call('GET', '/v1/items?status=RESOLVED&status=EXPIRED&status=CANCELLED')
    expectContract('waiting-on', 'item-list.schema.json', closed)
    const first = items[0]!
    expectContract('waiting-on', 'item.schema.json', await call('GET', `/v1/items/${first.id}`))
    expectContract('waiting-on', 'timeline.schema.json', await call('GET', `/v1/items/${first.id}/timeline`))
    expectContract(
      'waiting-on',
      'draft.schema.json',
      await call('GET', `/v1/items/${first.id}/draft?tone=ESCALATION`),
    )
  })

  it('POST /v1/items, snooze and resolve return an item', async () => {
    const created = (await call('POST', '/v1/items', {
      title: 'Contract check refund',
      counterparty: 'Shop Ltd',
      category: 'REFUND',
      amount: 12.5,
      currency: 'GBP',
      expectedBy: '2030-01-01',
    })) as { id: string }
    expectContract('waiting-on', 'item.schema.json', created)
    expectContract(
      'waiting-on',
      'item.schema.json',
      await call('POST', `/v1/items/${created.id}/snooze`, { days: 3 }),
    )
    expectContract(
      'waiting-on',
      'item.schema.json',
      await call('POST', `/v1/items/${created.id}/resolve`, { outcome: 'Paid' }),
    )
  })
})

describe('consent demo API', () => {
  const call = client(consent)
  const c = (file: string, body: unknown) => expectContract('consent', file, body)

  it('home: dashboard, requests inbox and grants (Today)', async () => {
    c('dashboard.schema.json', await call('GET', '/v1/owner/dashboard'))
    const pending = (await call('GET', '/v1/owner/requests?status=PENDING')) as { id: string }[]
    c('request-list.schema.json', pending)
    c('request-list.schema.json', await call('GET', '/v1/owner/requests'))
    c('request.schema.json', await call('GET', `/v1/owner/requests/${pending[0]!.id}`))
    c('grant-list.schema.json', await call('GET', '/v1/owner/grants'))
    c('grant-list.schema.json', await call('GET', '/v1/owner/grants?includeInactive=true'))
  })

  it('vault, clients and the audit trail', async () => {
    const attributes = (await call('GET', '/v1/owner/vault/attributes')) as { keyPath: string }[]
    c('attribute-list.schema.json', attributes)
    c(
      'attribute.schema.json',
      await call('GET', `/v1/owner/vault/attributes/${encodeURIComponent(attributes[0]!.keyPath)}`),
    )
    const clients = (await call('GET', '/v1/owner/clients')) as { clientId: string }[]
    c('client-list.schema.json', clients)
    c('client.schema.json', await call('GET', `/v1/owner/clients/${clients[0]!.clientId}`))
    c('access-log.schema.json', await call('GET', '/v1/owner/access-log'))
    c('chain-report.schema.json', await call('GET', '/v1/owner/audit/verify'))
  })

  it('writes: create attribute, register client, approve, deny, revoke', async () => {
    c(
      'attribute.schema.json',
      await call('POST', '/v1/owner/vault/attributes', {
        keyPath: 'contract.check',
        value: { size: 9 },
        sensitivity: 'PERSONAL',
      }),
    )
    c(
      'client-with-secret.schema.json',
      await call('POST', '/v1/owner/clients', { name: 'Contract app', allowedScopes: ['profile:read'] }),
    )
    const pending = (await call('GET', '/v1/owner/requests?status=PENDING')) as { id: string }[]
    expect(pending.length).toBeGreaterThan(1)
    const grant = (await call('POST', `/v1/owner/requests/${pending[0]!.id}/approve`, {})) as {
      id: string
    }
    c('grant.schema.json', grant)
    c('request.schema.json', await call('POST', `/v1/owner/requests/${pending[1]!.id}/deny`, {}))
    c('grant.schema.json', await call('POST', `/v1/owner/grants/${grant.id}/revoke`))
  })
})

describe('home-pulse demo API', () => {
  const call = client(homePulse)
  const c = (file: string, body: unknown) => expectContract('home-pulse', file, body)

  it('home and Today: appliances, alerts, reminders; then each appliance page', async () => {
    const appliances = (await call('GET', '/v1/appliances')) as { id: string }[]
    c('appliance-list.schema.json', appliances)
    c('alert-list.schema.json', await call('GET', '/v1/alerts'))
    c('alert-list.schema.json', await call('GET', '/v1/alerts?status=OPEN'))
    c('reminder-list.schema.json', await call('GET', '/v1/reminders'))
    const now = Date.now()
    const from = new Date(now - 24 * 3600_000).toISOString()
    const to = new Date(now).toISOString()
    for (const { id } of appliances) {
      c('appliance.schema.json', await call('GET', `/v1/appliances/${id}`))
      c('health.schema.json', await call('GET', `/v1/appliances/${id}/health`))
      c(
        'readings.schema.json',
        await call(
          'GET',
          `/v1/appliances/${id}/readings?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}&resolution=ONE_HOUR`,
        ),
      )
    }
  })

  it('writes: create an appliance and acknowledge an alert', async () => {
    c(
      'appliance.schema.json',
      await call('POST', '/v1/appliances', { name: 'Contract fridge', type: 'FRIDGE' }),
    )
    const alerts = (await call('GET', '/v1/alerts?status=OPEN')) as { id: string }[]
    c('alert.schema.json', await call('GET', `/v1/alerts/${alerts[0]!.id}`))
    c('alert.schema.json', await call('POST', `/v1/alerts/${alerts[0]!.id}/ack`))
  })
})

describe('ask-your-life demo API', () => {
  const call = client(askYourLife)
  const c = (file: string, body: unknown) => expectContract('ask-your-life', file, body)

  it('library and each document', async () => {
    const documents = (await call('GET', '/v1/documents')) as { id: string }[]
    c('document-list.schema.json', documents)
    c('document.schema.json', await call('GET', `/v1/documents/${documents[0]!.id}`))
  })

  it('search: answer and hits, keyword only, and the explain variant', async () => {
    const hybrid = (await call('GET', '/v1/search?q=deposit&k=5')) as { hits: unknown[] }
    expect(hybrid.hits.length).toBeGreaterThan(0)
    c('search.schema.json', hybrid)
    c('search.schema.json', await call('GET', '/v1/search?q=deposit&mode=keyword&debug=true'))
    c('search.schema.json', await call('GET', '/v1/search/explain?q=deposit'))
  })

  it('writes: add a note, re-post it unchanged, update it', async () => {
    const created = (await call('POST', '/v1/documents', {
      title: 'Contract note',
      text: 'The boiler was serviced in March.',
      sourceType: 'NOTE',
      externalId: 'contract-1',
    })) as { document: { id: string } }
    c('ingest.schema.json', created)
    c(
      'ingest.schema.json',
      await call('POST', '/v1/documents', {
        title: 'Contract note',
        text: 'The boiler was serviced in March.',
        sourceType: 'NOTE',
        externalId: 'contract-1',
      }),
    )
    c(
      'ingest.schema.json',
      await call('PUT', `/v1/documents/${created.document.id}`, { text: 'Serviced in April.' }),
    )
  })
})

describe('digital-legacy demo API', () => {
  const c = (file: string, body: unknown) => expectContract('digital-legacy', file, body)

  it('before a vault exists (a new demo session)', async () => {
    const call = client(digitalLegacy)
    c('vault.schema.json', await call('GET', '/v1/legacy/vault'))
    c('state.schema.json', await call('GET', '/v1/legacy/vault/state'))
    c('ciphertext.schema.json', await call('GET', '/v1/legacy/vault/ciphertext'))
    c('chain.schema.json', await call('GET', '/v1/legacy/vault/audit/verify'))
  })

  it('an armed vault with three trustees holding shares (the same mock, set up like its own tests)', async () => {
    const { h } = await armedScenario()
    const call = async (method: string, path: string, body?: unknown) => {
      const response = await h.backend.fetch(`/api${path}`, {
        method,
        headers: { authorization: 'Bearer stub-token-1', 'content-type': 'application/json' },
        body: body === undefined ? undefined : JSON.stringify(body),
      })
      if (!response.ok) throw new Error(`${method} ${path}: ${response.status}`)
      return (await response.json()) as unknown
    }
    c('vault.schema.json', await call('GET', '/v1/legacy/vault'))
    c('state.schema.json', await call('GET', '/v1/legacy/vault/state'))
    c('state.schema.json', await call('POST', '/v1/legacy/vault/checkin'))
    c('state.schema.json', await call('POST', '/v1/legacy/vault/pause', { durationSeconds: 3600 }))
    c('state.schema.json', await call('POST', '/v1/legacy/vault/resume'))
    c('ciphertext.schema.json', await call('GET', '/v1/legacy/vault/ciphertext'))
    c('timeline.schema.json', await call('GET', '/v1/legacy/vault/timeline'))
    c('chain.schema.json', await call('GET', '/v1/legacy/vault/audit/verify'))
    c('trustee-list.schema.json', await call('GET', '/v1/legacy/vault/trustees'))
    c('invite.schema.json', await call('POST', '/v1/legacy/vault/trustees', { label: 'Dee' }))
    c('trustee-list.schema.json', await call('GET', '/v1/legacy/vault/trustees')) // with an INVITED one
  })
})
